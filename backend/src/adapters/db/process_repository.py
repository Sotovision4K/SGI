import json
import logging
import uuid

from sqlmodel import SQLModel, Field, select
from sqlalchemy import update, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.process import Process, ProcessStatus, IsoStandard
from src.domain.entities.finding import Finding
from src.domain.entities.plan import Plan, Task, TaskPriority
from src.domain.entities.audit_log import AuditLogLLM
from src.domain.entities.plan_job import PlanJob, PlanJobStatus
from src.errors import JobErrorCode, LeaseLostError
from src.adapters.db.user_repository import CompanyTable, get_engine

logger = logging.getLogger(__name__)

# Stale-lease recovery (spec §7 / decision 19): a `running` job whose lease has
# expired (no heartbeat for this long) is reclaimable on SQS redelivery. The
# value must exceed the per-segment worst case; raised 180→300 to match
# _SEGMENT_TIMEOUT_SECONDS=180 in plan_generation.py (Stage-C smoke fix — the
# whole budget needs a proper latency model, see technical_debt.md).
LEASE_TTL_SECONDS = 300


class ProcessTable(SQLModel, table=True):
    __tablename__ = "processes"

    id: uuid.UUID = Field(primary_key=True)
    consultant_id: uuid.UUID = Field(index=True)
    company_id: uuid.UUID = Field(index=True)
    pre_diagnosis: str = Field(default="{}")
    iso_standard: str = Field(max_length=20, index=True)
    status: str = Field(max_length=20, default="in_diagnosis", index=True)
    created_at: str
    updated_at: str


class FindingTable(SQLModel, table=True):
    __tablename__ = "findings"

    id: uuid.UUID = Field(primary_key=True)
    process_id: uuid.UUID = Field(unique=True, index=True, foreign_key="processes.id")
    answers: str = Field(default="{}")
    free_text: str = Field(default="")
    updated_at: str


class PlanTable(SQLModel, table=True):
    __tablename__ = "plans"

    id: uuid.UUID = Field(primary_key=True)
    process_id: uuid.UUID = Field(unique=True, index=True, foreign_key="processes.id")
    summary_md: str = Field(default="")
    generated_at: str
    # Persistence-only edit metadata (Phase 6) — deliberately NOT on the Plan
    # domain entity: they describe how the stored plan was produced/edited.
    updated_at: str = Field(default="")   # ISO 8601, bumped on every task edit
    revision: int = Field(default=0)      # 0 = LLM-generated; +1 per hand-edit


class TaskTable(SQLModel, table=True):
    __tablename__ = "tasks"

    id: uuid.UUID = Field(primary_key=True)
    plan_id: uuid.UUID = Field(index=True)
    title: str = Field(max_length=200)
    description: str = Field(default="")
    priority: str = Field(max_length=10, default="medium")
    estimated_effort: str = Field(max_length=100, default="")
    owner_role: str = Field(max_length=100, default="")
    sort_order: int = Field(default=0)
    source_clause: str = Field(default="")
    require_document: bool = Field(default=False)
    document_title: str | None = Field(default=None, max_length=200)


class AuditLogLlmTable(SQLModel, table=True):
    """SQLModel table for the `audit_logs_llm` table (spec §6).

    # Q: Why store JSONB as str instead of a native JSON/JSONB column type?
    # A: SQLite (used in local tests) has no native JSONB type; using str keeps
    #    the model portable across SQLite and Postgres while remaining
    #    SQLite-compatible. The repository serializes/deserializes at the
    #    boundary. Postgres accepts TEXT for JSON content equally well.
    # Decision: Store request_payload and response_json as JSON strings, and
    # created_at as an ISO 8601 string — mirroring the existing ProcessTable /
    # FindingTable convention (see pre_diagnosis / answers columns).
    """

    __tablename__ = "audit_logs_llm"

    # Q: Which fields are indexed?
    # A: process_id is the primary lookup key for audit history per generation
    #    run — index it. job_id is optional but also useful for per-job audit;
    #    leave unindexed for now (spec doesn't require it).
    # Decision: index process_id only, mirroring FindingTable's process_id index.
    id: uuid.UUID = Field(primary_key=True, default_factory=uuid.uuid4)
    process_id: uuid.UUID = Field(foreign_key="processes.id", index=True)
    job_id: uuid.UUID | None = Field(default=None, nullable=True)
    bucket: str | None = Field(default=None, max_length=10, nullable=True)
    attempt: int = Field(default=1)
    model: str = Field(default="", max_length=50)
    iso_standard: str = Field(default="", max_length=20)
    request_payload: str = Field(default="{}")  # JSON string (SQLite-compatible)
    response_json: str | None = Field(default=None, nullable=True)
    input_tokens: int = Field(default=0)
    output_tokens: int = Field(default=0)
    latency_ms: int = Field(default=0)
    status: str = Field(default="success", max_length=20)
    error: str | None = Field(default=None, nullable=True)
    created_at: str  # stored as ISO 8601 string


class PlanJobTable(SQLModel, table=True):
    """SQLModel table for the `plan_jobs` table (spec §6).

    # Q: Why is process_id the primary key (not a synthetic id)?
    # A: 1:1 with `processes` — one job row per process at a time. The enqueue
    #    endpoint returns an idempotent 202 while a job is queued/running, so
    #    there is never more than one row. A synthetic id would add a join with
    #    no benefit.
    # Q: Why store segments/snapshots as JSON strings, not native JSONB?
    # A: SQLite (used in local tests) has no JSONB; str keeps the model portable
    #    across SQLite and Postgres. The repository serializes/deserializes at
    #    the boundary — mirroring ProcessTable.pre_diagnosis / FindingTable.answers.
    # Decision: process_id PK/FK; JSON-as-str columns; timestamps as ISO 8601 str.
    """

    __tablename__ = "plan_jobs"

    process_id: uuid.UUID = Field(primary_key=True, foreign_key="processes.id")
    consultant_id: uuid.UUID = Field(index=True)  # owner snapshot — ownership check
    status: str = Field(max_length=20, default="queued", index=True)
    error: str | None = Field(default=None, nullable=True)
    segments: str = Field(default="{}")  # JSON string — per-bucket checkpoint
    failed_attempts: int = Field(default=0)
    findings_snapshot: str = Field(default="{}")  # JSON string
    pre_diagnosis_snapshot: str = Field(default="{}")  # JSON string
    source_updated_at: str = Field(default="")  # findings.updated_at at enqueue
    completed_count: int = Field(default=0)  # cumulative successful generations
    created_at: str
    updated_at: str


class ProcessRepository:
    """Repository for Process, Finding, Plan, Task, PlanJob, and audit tables.

    Co-located because they share a tight lifecycle and live in the same DB.

    Also hosts the LLM audit-log writer (`insert_audit_log_llm`) since audit
    rows reference `processes.id`.
    """

    def __init__(self, database_url: str) -> None:
        self._engine = get_engine(database_url)

    # ---- Process ----------------------------------------------------------

    async def create_process(self, process: Process) -> Process:
        async with AsyncSession(self._engine) as session:
            row = ProcessTable(
                id=process.id,
                consultant_id=process.consultant_id,
                company_id=process.company_id,
                pre_diagnosis=json.dumps(process.pre_diagnosis, ensure_ascii=False),
                iso_standard=process.iso_standard.value,
                status=process.status.value,
                created_at=process.created_at.isoformat(),
                updated_at=process.updated_at.isoformat(),
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return self._process_to_domain(row)

    async def get_process(self, process_id: uuid.UUID) -> Process | None:
        async with AsyncSession(self._engine) as session:
            row = await session.get(ProcessTable, process_id)
            return self._process_to_domain(row) if row else None

    async def list_processes(
        self,
        consultant_id: uuid.UUID | None = None,
        status: str | None = None,
    ) -> list[Process]:
        # Validate the status filter; "active" is a route-level concept that
        # maps to "everything that is NOT completed" — it is never sent to SQL
        # as a literal (rule #2).
        if status not in (None, "active", "completed"):
            raise ValueError(f"Invalid status filter: {status!r}")

        async with AsyncSession(self._engine) as session:
            stmt = select(ProcessTable).order_by(ProcessTable.created_at.desc())
            if consultant_id is not None:
                stmt = stmt.where(ProcessTable.consultant_id == consultant_id)
            if status == "active":
                stmt = stmt.where(ProcessTable.status != ProcessStatus.COMPLETED.value)
            elif status == "completed":
                stmt = stmt.where(ProcessTable.status == ProcessStatus.COMPLETED.value)
            rows = (await session.execute(stmt)).scalars().all()
            return [self._process_to_domain(r) for r in rows]

    async def list_processes_with_company(
        self,
        consultant_id: uuid.UUID | None = None,
        status: str | None = None,
    ) -> list[tuple[Process, str | None]]:
        """List processes with their company name in a single query.

        Uses a correlated scalar subquery (LEFT-join semantics): every process
        is returned even when its company row is missing, in which case the
        name is None. This replaces the previous N+1 per-process hydration in
        the routes layer.
        """
        if status not in (None, "active", "completed"):
            raise ValueError(f"Invalid status filter: {status!r}")

        company_name = (
            select(CompanyTable.name)
            .where(CompanyTable.company_id == ProcessTable.company_id)
            .scalar_subquery()
        )
        stmt = (
            select(ProcessTable, company_name.label("company_name"))
            .order_by(ProcessTable.created_at.desc())
        )
        if consultant_id is not None:
            stmt = stmt.where(ProcessTable.consultant_id == consultant_id)
        if status == "active":
            stmt = stmt.where(ProcessTable.status != ProcessStatus.COMPLETED.value)
        elif status == "completed":
            stmt = stmt.where(ProcessTable.status == ProcessStatus.COMPLETED.value)

        async with AsyncSession(self._engine) as session:
            rows = (await session.execute(stmt)).all()
            return [(self._process_to_domain(r[0]), r[1]) for r in rows]

    async def update_process_status(self, process_id: uuid.UUID, status: ProcessStatus) -> None:
        from datetime import datetime, timezone
        async with AsyncSession(self._engine) as session:
            row = await session.get(ProcessTable, process_id)
            if row is None:
                raise ValueError("Process not found")
            row.status = status.value
            row.updated_at = datetime.now(timezone.utc).isoformat()
            await session.commit()

    async def update_pre_diagnosis(self, process_id: uuid.UUID, answers: dict) -> None:
        from datetime import datetime, timezone
        import json
        async with AsyncSession(self._engine) as session:
            row = await session.get(ProcessTable, process_id)
            if row is None:
                raise ValueError("Process not found")
            row.pre_diagnosis = json.dumps(answers, ensure_ascii=False)
            row.updated_at = datetime.now(timezone.utc).isoformat()
            await session.commit()

    # ---- Findings ---------------------------------------------------------

    async def upsert_finding(self, finding: Finding) -> Finding:
        import json
        from datetime import datetime, timezone
        async with AsyncSession(self._engine) as session:
            existing = (
                await session.execute(
                    select(FindingTable).where(FindingTable.process_id == finding.process_id)
                )
            ).scalar_one_or_none()
            if existing is None:
                row = FindingTable(
                    id=finding.id,
                    process_id=finding.process_id,
                    answers=json.dumps(finding.answers, ensure_ascii=False),
                    free_text=finding.free_text,
                    updated_at=datetime.now(timezone.utc).isoformat(),
                )
                session.add(row)
            else:
                existing.answers = json.dumps(finding.answers, ensure_ascii=False)
                existing.free_text = finding.free_text
                existing.updated_at = datetime.now(timezone.utc).isoformat()
                row = existing
            await session.commit()
            await session.refresh(row)
            return self._finding_to_domain(row)

    async def get_finding(self, process_id: uuid.UUID) -> Finding | None:
        async with AsyncSession(self._engine) as session:
            row = (
                await session.execute(
                    select(FindingTable).where(FindingTable.process_id == process_id)
                )
            ).scalar_one_or_none()
            if row is None:
                return None
            return self._finding_to_domain(row)

    # ---- Plan + Tasks -----------------------------------------------------

    async def replace_plan(self, plan: Plan) -> Plan:
        from datetime import datetime, timezone
        async with AsyncSession(self._engine) as session:
            # Wipe any existing plan + tasks for this process
            existing = (
                await session.execute(
                    select(PlanTable).where(PlanTable.process_id == plan.process_id)
                )
            ).scalar_one_or_none()
            if existing is not None:
                old_plan_id = existing.id
                old_tasks = (await session.execute(
                    select(TaskTable).where(TaskTable.plan_id == old_plan_id)
                )).scalars().all()
                for t in old_tasks:
                    await session.delete(t)
                await session.delete(existing)
                await session.flush()

            # A (re)generated plan is pristine LLM output: revision resets to 0
            # and updated_at starts fresh. Hand-edits via patch_task bump both.
            now = datetime.now(timezone.utc).isoformat()
            plan_row = PlanTable(
                id=plan.id,
                process_id=plan.process_id,
                summary_md=plan.summary_md,
                generated_at=now,
                updated_at=now,
                revision=0,
            )
            session.add(plan_row)
            for task in plan.tasks:
                session.add(TaskTable(
                    id=task.id,
                    plan_id=plan.id,
                    title=task.title,
                    description=task.description,
                    priority=task.priority.value,
                    estimated_effort=task.estimated_effort,
                    owner_role=task.owner_role,
                    sort_order=task.sort_order,
                    source_clause=task.source_clause,
                    require_document=task.require_document,
                    document_title=task.document_title,
                ))
            await session.commit()
            return plan

    async def get_plan(self, process_id: uuid.UUID) -> Plan | None:
        async with AsyncSession(self._engine) as session:
            plan_row = (
                await session.execute(
                    select(PlanTable).where(PlanTable.process_id == process_id)
                )
            ).scalar_one_or_none()
            if plan_row is None:
                return None
            task_rows = (await session.execute(
                select(TaskTable).where(TaskTable.plan_id == plan_row.id).order_by(TaskTable.sort_order)
            )).scalars().all()
            tasks = [self._task_to_domain(t) for t in task_rows]
            return self._plan_to_domain(plan_row, tasks)

    async def patch_task(
        self, process_id: uuid.UUID, task_id: uuid.UUID, updates: dict
    ) -> Task | None:
        """Apply a partial hand-edit to a single task of a process's plan (Phase 6).

        # Q: Why return None for BOTH "no plan" and "no matching task"?
        # A: The route maps both to the same 404 ("Tarea no encontrada").
        #    Scoping the task lookup by `plan_id == plan.id` also makes a task
        #    belonging to another process's plan indistinguishable from a
        #    non-existent one — no cross-process leakage (IDOR-safe by scoping).
        # Q: Why skip None values for every field except document_title?
        # A: The route uses model_dump(exclude_unset=True), so a key present
        #    with None means the client explicitly sent null. For the nullable
        #    document_title that is a deliberate "clear it"; for every other
        #    (non-nullable) field, null means "not provided" and must not
        #    clobber the stored value.
        # Q: Why convert priority defensively (enum → .value)?
        # A: The route already converts TaskPriority to its string value, but
        #    the repository must not depend on every caller doing so — a raw
        #    enum stored in the str column would not round-trip uniformly
        #    across dialects. Normalize at the boundary.
        # Q: Why bump plan.updated_at / plan.revision on a *task* edit?
        # A: They are plan-level edit metadata (persistence-only, not on the
        #    Plan entity): updated_at powers "last edited" display and revision
        #    marks a hand-edited plan (0 = pristine LLM output, +1 per
        #    hand-edit). One patch call is one hand-edit.
        # Decision: single session/transaction — find plan, find task scoped
        #    to that plan, setattr the provided fields, bump plan metadata,
        #    commit, refresh the task row, return the domain Task.
        """
        from datetime import datetime, timezone

        async with AsyncSession(self._engine) as session:
            plan = (
                await session.execute(
                    select(PlanTable).where(PlanTable.process_id == process_id)
                )
            ).scalar_one_or_none()
            if plan is None:
                return None

            task = (
                await session.execute(
                    select(TaskTable).where(
                        TaskTable.id == task_id, TaskTable.plan_id == plan.id
                    )
                )
            ).scalar_one_or_none()
            if task is None:
                return None

            for key, value in updates.items():
                if value is None and key != "document_title":
                    # Explicit null on a non-nullable field = "not provided".
                    continue
                if key == "priority" and hasattr(value, "value"):
                    value = value.value  # TaskPriority enum → "high"/"medium"/"low"
                setattr(task, key, value)

            plan.updated_at = datetime.now(timezone.utc).isoformat()
            plan.revision += 1

            await session.commit()
            await session.refresh(task)
            return self._task_to_domain(task)

    # ---- LLM audit log -----------------------------------------------------

    async def insert_audit_log_llm(
        self,
        audit: AuditLogLLM,
    ) -> AuditLogLLM:
        """Insert an LLM audit log row. Never raises — logs and swallows on failure.

        # Q: Why must this method never raise?
        # A: Per spec §6, an AuditLogWriteError must never break generation.
        #    The audit log is an observational side-effect; a DB failure during
        #    audit recording must not abort the plan-generation pipeline.
        # Decision: Wrap the entire DB interaction in a try/except, log the
        # failure, and return the input entity unchanged as a best-effort
        # result. This keeps callers' shape identical to the success path.
        """
        # Q: Why serialize request_payload/response_json with ensure_ascii=False?
        # A: Preserve accented characters (Spanish content) as-is instead of
        #    escaping to \\uXXXX — smaller payloads and readable in DB queries.
        # Decision: Match the convention used for pre_diagnosis/answers columns.
        try:
            row = AuditLogLlmTable(
                id=audit.id,
                process_id=audit.process_id,
                job_id=audit.job_id,
                bucket=audit.bucket,
                attempt=audit.attempt,
                model=audit.model,
                iso_standard=audit.iso_standard,
                request_payload=json.dumps(
                    audit.request_payload, ensure_ascii=False
                ),
                response_json=(
                    json.dumps(audit.response_json, ensure_ascii=False)
                    if audit.response_json is not None
                    else None
                ),
                input_tokens=audit.input_tokens,
                output_tokens=audit.output_tokens,
                latency_ms=audit.latency_ms,
                status=audit.status.value,
                error=audit.error,
                created_at=audit.created_at.isoformat(),
            )
            async with AsyncSession(self._engine) as session:
                session.add(row)
                await session.commit()
                await session.refresh(row)
            return self._audit_log_to_domain(row)
        except Exception as exc:
            # Q: Should we re-raise or swallow?
            # A: Swallow. The audit must never break generation. Log at
            #    error level so failures are observable in CloudWatch.
            # Decision: Best-effort — return the input entity so the caller's
            # handle remains usable.
            logger.error(
                "Failed to insert LLM audit log for process %s attempt %s: %s",
                audit.process_id,
                audit.attempt,
                type(exc).__name__,
            )
            return audit

    # ---- Plan job (async generation) --------------------------------------

    async def create_plan_job(self, job: PlanJob) -> PlanJob:
        """Enqueue a generation job, snapshotting findings + pre_diagnosis.

        # Q: Why a single atomic upsert instead of read-then-write?
        # A: The previous read-modify-write had a TOCTOU window: two concurrent
        #    enqueues could both observe "no job" (or "failed") and race,
        #    risking a lost update or a PK violation. `INSERT ... ON CONFLICT`
        #    makes the terminal→queued reset and the fresh insert atomic.
        # Q: Why does DO UPDATE carry a WHERE status IN ('failed','completed')?
        # A: A process has at most one job row. On re-trigger after a terminal
        #    job we reset it to `queued` with a fresh snapshot. But while
        #    `queued`/`running`, a duplicate enqueue must NOT disturb the active
        #    job — the WHERE guard makes the update a no-op (idempotent 202
        #    reuse). `completed_count` is deliberately NOT in `set_` so the
        #    cumulative cap counter survives any reset.
        # Q: Why dialect-aware (pg_insert / sqlite_insert)?
        # A: Production is Postgres, tests run on in-memory SQLite. Neither
        #    dialect's `insert().on_conflict_do_update()` is portable, so we
        #    pick the right builder from the engine's dialect name.
        """
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat()

        values = {
            "process_id": job.process_id,
            "consultant_id": job.consultant_id,
            "status": PlanJobStatus.QUEUED.value,
            "error": None,
            "segments": json.dumps(job.segments, ensure_ascii=False),
            "failed_attempts": 0,
            "findings_snapshot": json.dumps(job.findings_snapshot, ensure_ascii=False),
            "pre_diagnosis_snapshot": json.dumps(
                job.pre_diagnosis_snapshot, ensure_ascii=False
            ),
            "source_updated_at": job.source_updated_at,
            "completed_count": job.completed_count,
            "created_at": now,
            "updated_at": now,
        }

        if self._engine.dialect.name == "postgresql":
            from sqlalchemy.dialects.postgresql import insert as dialect_insert
        else:
            from sqlalchemy.dialects.sqlite import insert as dialect_insert

        insert_stmt = dialect_insert(PlanJobTable).values(**values)
        excluded = insert_stmt.excluded
        stmt = insert_stmt.on_conflict_do_update(
            index_elements=[PlanJobTable.process_id],
            set_={
                "consultant_id": excluded.consultant_id,
                "status": PlanJobStatus.QUEUED.value,
                "error": None,
                "segments": excluded.segments,
                "failed_attempts": 0,
                "findings_snapshot": excluded.findings_snapshot,
                "pre_diagnosis_snapshot": excluded.pre_diagnosis_snapshot,
                "source_updated_at": excluded.source_updated_at,
                "updated_at": excluded.updated_at,
                # completed_count intentionally omitted — preserve the cap.
            },
            where=PlanJobTable.status.in_(
                [PlanJobStatus.FAILED.value, PlanJobStatus.COMPLETED.value]
            ),
        )

        async with AsyncSession(self._engine) as session:
            await session.execute(stmt)
            await session.commit()
            row = await session.get(PlanJobTable, job.process_id)
            return self._plan_job_to_domain(row)

    async def get_plan_job(self, process_id: uuid.UUID) -> PlanJob | None:
        async with AsyncSession(self._engine) as session:
            row = await session.get(PlanJobTable, process_id)
            return self._plan_job_to_domain(row) if row else None

    async def claim_job(self, process_id: uuid.UUID, consultant_id: uuid.UUID) -> bool:
        """Atomically acquire the lease (`queued|stale-running → running`), verifying ownership.

        # Q: Why does the WHERE guard include `consultant_id == :consultant_id`?
        # A: Two goals in one atomic UPDATE. (1) Ownership: the worker passes the
        #    `consultant_id` from the SQS message; a forged/wrong-owner message
        #    fails the clause → rowcount 0 → rejected without touching the job.
        #    (2) Atomicity: only one concurrent claim wins; the loser's UPDATE
        #    matches nothing.
        # Q: Why also match a *stale* `running` job, not just `queued`?
        # A: Stale-lease recovery (decision 19). A crashed worker leaves the job
        #    at `running` forever — `claim_job` was previously a no-op on
        #    redelivery, silently dropping the message and wedging the process.
        #    A `running` job whose `updated_at` heartbeat is older than
        #    LEASE_TTL_SECONDS is reclaimable, so a redelivered message resumes it.
        # Decision: single atomic UPDATE carrying the ownership check + the
        # lease check. `updated_at` doubles as the heartbeat (every segment
        # checkpoint bumps it), so a healthy run stays non-stale while alive.
        """
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        # ISO 8601 UTC strings sort lexicographically == chronologically, so a
        # plain string comparison in SQL is a correct "older than" test.
        stale_before = (now - timedelta(seconds=LEASE_TTL_SECONDS)).isoformat()

        async with AsyncSession(self._engine) as session:
            result = await session.execute(
                update(PlanJobTable)
                .where(
                    PlanJobTable.process_id == process_id,
                    PlanJobTable.consultant_id == consultant_id,
                    or_(
                        PlanJobTable.status == PlanJobStatus.QUEUED.value,
                        and_(
                            PlanJobTable.status == PlanJobStatus.RUNNING.value,
                            PlanJobTable.updated_at < stale_before,
                        ),
                    ),
                )
                .values(
                    status=PlanJobStatus.RUNNING.value,
                    updated_at=now.isoformat(),
                )
            )
            await session.commit()
            return result.rowcount == 1

    async def requeue_job(self, process_id: uuid.UUID) -> None:
        """Release a `running` job back to `queued` (deliberate retry).

        # Q: Why a separate method instead of letting the lease expire?
        # A: When the worker exhausts in-process retries for a segment and wants
        #    the whole message redelivered, its last checkpoint write is seconds
        #    old — well inside LEASE_TTL_SECONDS. Waiting for natural lease
        #    expiry would defer the retry by ~3 min AND risk a race at the
        #    threshold. Explicitly re-queueing makes the redelivered message
        #    claim through the normal `queued` path immediately.
        # Q: Why bump `failed_attempts` here?
        # A: Each requeue is one whole-job retry. The worker reads
        #    `failed_attempts` to enforce the redelivery cap (Phase 4, no
        #    Terraform `maximumRetryAttempts` yet) and goes terminal past it.
        # Decision: `running → queued` + `failed_attempts + 1` so SQS redelivery
        # re-claims and re-runs only the `pending`/`failed` segments.
        """
        from datetime import datetime, timezone

        async with AsyncSession(self._engine) as session:
            await session.execute(
                update(PlanJobTable)
                .where(
                    PlanJobTable.process_id == process_id,
                    PlanJobTable.status == PlanJobStatus.RUNNING.value,
                )
                .values(
                    status=PlanJobStatus.QUEUED.value,
                    failed_attempts=PlanJobTable.failed_attempts + 1,
                    updated_at=datetime.now(timezone.utc).isoformat(),
                )
            )
            await session.commit()

    async def get_company_name(self, company_id: uuid.UUID) -> str:
        """Return the company's display name ("" if missing) for prompt building."""
        async with AsyncSession(self._engine) as session:
            row = await session.get(CompanyTable, company_id)
            return (row.name or "") if row else ""

    async def update_job_segments(self, process_id: uuid.UUID, segments: dict) -> None:
        """Persist the per-bucket checkpoint (resumable retry), guarded by the lease.

        # Q: Why a conditional UPDATE instead of get → mutate → commit?
        # A: The old read-modify-write of the whole `segments` blob was
        #    non-atomic (M3). Under lease theft (SQS redelivery putting two
        #    workers on one job) the stale worker clobbered the new worker's
        #    checkpoint — and a later complete_job from the stale worker could
        #    double-bump `completed_count`. A single UPDATE guarded by
        #    `status='running'` (mirroring `complete_job`) makes every
        #    checkpoint a lease assertion: the write only lands while this
        #    worker still owns the lease.
        # Q: What does rowcount != 1 mean?
        # A: The job is no longer `running` (completed/queued/failed/missing) —
        #    this worker lost the lease. Raise LeaseLostError so the caller
        #    abandons without failing or completing the job. This also replaces
        #    the old "row not found" ValueError: a missing row fails the same
        #    lease assertion.
        # Q: Why bump `updated_at` on every checkpoint?
        # A: It doubles as the heartbeat (lease keepalive) — `claim_job` only
        #    reclaims a `running` job whose heartbeat is older than
        #    LEASE_TTL_SECONDS (see above).
        # INVARIANT: worst-case inter-checkpoint gap ≈ _SEGMENT_TIMEOUT_SECONDS(30)
        #    × _MAX_SEGMENT_ATTEMPTS(3) + backoff ≈ 95s < LEASE_TTL_SECONDS(180)
        #    above. If you raise either constant or the token budget, raise
        #    LEASE_TTL_SECONDS and the SQS visibility timeout to match.
        """
        from datetime import datetime, timezone

        async with AsyncSession(self._engine) as session:
            result = await session.execute(
                update(PlanJobTable)
                .where(
                    PlanJobTable.process_id == process_id,
                    PlanJobTable.status == PlanJobStatus.RUNNING.value,
                )
                .values(
                    segments=json.dumps(segments, ensure_ascii=False),
                    updated_at=datetime.now(timezone.utc).isoformat(),
                )
            )
            await session.commit()
            if result.rowcount != 1:
                raise LeaseLostError(
                    f"checkpoint rejected — plan job {process_id} is no longer running"
                )

    async def complete_job(self, process_id: uuid.UUID) -> None:
        """Mark `running → completed` and atomically bump `completed_count`.

        # Q: Why `completed_count = completed_count + 1` in SQL (not in Python)?
        # A: Read-modify-write in Python would race between concurrent workers.
        #    The SQL expression increment is atomic at the DB level.
        # Decision: In-place SQL increment, guarded by status=running.
        """
        from datetime import datetime, timezone

        async with AsyncSession(self._engine) as session:
            await session.execute(
                update(PlanJobTable)
                .where(
                    PlanJobTable.process_id == process_id,
                    PlanJobTable.status == PlanJobStatus.RUNNING.value,
                )
                .values(
                    status=PlanJobStatus.COMPLETED.value,
                    completed_count=PlanJobTable.completed_count + 1,
                    updated_at=datetime.now(timezone.utc).isoformat(),
                )
            )
            await session.commit()

    async def fail_job(self, process_id: uuid.UUID, error: JobErrorCode) -> None:
        """Mark `queued|running → failed`, store the error code, bump `failed_attempts`.

        # Q: Why accept BOTH `queued` and `running` (not just `running`)?
        # A: The enqueue route calls `fail_job` when the SQS send fails — at that
        #    point the job is still `queued` (the worker never received a
        #    message, so nothing flipped it to `running`). Restricting the
        #    guard to `running` would make that rollback a silent no-op and
        #    wedge the process in `queued` forever (idempotent-202 reuse would
        #    block every retry). A `completed` job is deliberately NOT matched.
        """
        from datetime import datetime, timezone

        async with AsyncSession(self._engine) as session:
            await session.execute(
                update(PlanJobTable)
                .where(
                    PlanJobTable.process_id == process_id,
                    PlanJobTable.status.in_(
                        [PlanJobStatus.QUEUED.value, PlanJobStatus.RUNNING.value]
                    ),
                )
                .values(
                    status=PlanJobStatus.FAILED.value,
                    error=error.value,
                    failed_attempts=PlanJobTable.failed_attempts + 1,
                    updated_at=datetime.now(timezone.utc).isoformat(),
                )
            )
            await session.commit()

    async def get_completed_count(self, process_id: uuid.UUID) -> int:
        """Cumulative successful-generation count for the cap (max 3)."""
        async with AsyncSession(self._engine) as session:
            row = await session.get(PlanJobTable, process_id)
            return row.completed_count if row else 0

    async def get_active_job(self, process_id: uuid.UUID) -> PlanJob | None:
        """Return the job only while it is `queued`/`running`, else None.

        Used by the enqueue endpoint for idempotent 202 reuse.
        """
        job = await self.get_plan_job(process_id)
        if job is None:
            return None
        return job if job.status in (PlanJobStatus.QUEUED, PlanJobStatus.RUNNING) else None

    # ---- Mappers ----------------------------------------------------------

    @staticmethod
    def _process_to_domain(row: ProcessTable) -> Process:
        from datetime import datetime
        try:
            pre_diagnosis = json.loads(row.pre_diagnosis) if row.pre_diagnosis else {}
        except json.JSONDecodeError:
            pre_diagnosis = {}
        return Process(
            id=row.id,
            consultant_id=row.consultant_id,
            company_id=row.company_id,
            pre_diagnosis=pre_diagnosis,
            iso_standard=IsoStandard(row.iso_standard),
            status=ProcessStatus(row.status),
            created_at=datetime.fromisoformat(row.created_at),
            updated_at=datetime.fromisoformat(row.updated_at),
        )

    @staticmethod
    def _finding_to_domain(row: FindingTable) -> Finding:
        from datetime import datetime, timezone
        import json
        try:
            answers = json.loads(row.answers) if row.answers else {}
        except json.JSONDecodeError:
            answers = {}
        # Q: Why pass updated_at here when other *_to_domain mappers drop it?
        # A: Finding.updated_at is business data — the frontend consumes it
        #    via GET /findings to show "Last updated: <timestamp>". Unlike
        #    Task.updated_at (which is pure DB metadata), this field is
        #    user-facing and must carry the actual DB value.
        # Decision: Map it from the DB row so the response is accurate, not
        #    the factory default (current time of the read request).
        updated_at_dt = (
            datetime.fromisoformat(row.updated_at)
            if row.updated_at
            else datetime.now(timezone.utc)
        )
        return Finding(
            id=row.id,
            process_id=row.process_id,
            answers=answers,
            free_text=row.free_text,
            updated_at=updated_at_dt,
        )

    @staticmethod
    def _task_to_domain(row: TaskTable) -> Task:
        return Task(
            id=row.id,
            plan_id=row.plan_id,
            title=row.title,
            description=row.description,
            priority=TaskPriority(row.priority),
            estimated_effort=row.estimated_effort,
            owner_role=row.owner_role,
            sort_order=row.sort_order,
            source_clause=row.source_clause,
            require_document=row.require_document,
            document_title=row.document_title,
        )

    @staticmethod
    def _plan_to_domain(row: PlanTable, tasks: list[Task]) -> Plan:
        from datetime import datetime
        return Plan(
            id=row.id,
            process_id=row.process_id,
            summary_md=row.summary_md,
            generated_at=datetime.fromisoformat(row.generated_at),
            tasks=tasks,
        )

    @staticmethod
    def _audit_log_to_domain(row: AuditLogLlmTable) -> AuditLogLLM:
        """Map an AuditLogLlmTable row back to the domain entity.

        # Q: How are the JSON-string columns handled?
        # A: request_payload/response_json are stored as JSON strings; parse
        #    them back into dicts. On decode failure, fall back to {} / None so
        #    a corrupt row never propagates as a raw string into the entity.
        # Decision: Defensive deserialization — mirrors _finding_to_domain's
        # JSONDecodeError handling for the answers column.
        """
        from datetime import datetime
        from src.domain.entities.audit_log import AuditLogStatus

        try:
            request_payload = json.loads(row.request_payload) if row.request_payload else {}
        except json.JSONDecodeError:
            request_payload = {}

        response_json = None
        if row.response_json is not None:
            try:
                response_json = json.loads(row.response_json)
            except json.JSONDecodeError:
                response_json = None

        try:
            created_at = datetime.fromisoformat(row.created_at)
        except (ValueError, TypeError):
            from datetime import timezone as _tz
            created_at = datetime.now(_tz.utc)

        return AuditLogLLM(
            id=row.id,
            process_id=row.process_id,
            job_id=row.job_id,
            bucket=row.bucket,
            attempt=row.attempt,
            model=row.model,
            iso_standard=row.iso_standard,
            request_payload=request_payload,
            response_json=response_json,
            input_tokens=row.input_tokens,
            output_tokens=row.output_tokens,
            latency_ms=row.latency_ms,
            status=AuditLogStatus(row.status),
            error=row.error,
            created_at=created_at,
        )

    @staticmethod
    def _plan_job_to_domain(row: PlanJobTable) -> PlanJob:
        """Map a PlanJobTable row back to the domain entity.

        # Q: Why defensive JSON/date deserialization?
        # A: segments/snapshots are JSON strings; a corrupt row must never
        #    propagate raw strings into the entity. Date columns are ISO 8601
        #    strings that may be empty on legacy rows. Mirror the defensive
        #    parsing used by _finding_to_domain and _audit_log_to_domain.
        """
        from datetime import datetime, timezone

        def _json_dict(raw: str | None) -> dict:
            if not raw:
                return {}
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return {}

        def _ts(raw: str | None) -> datetime:
            if raw:
                try:
                    return datetime.fromisoformat(raw)
                except (ValueError, TypeError):
                    pass
            return datetime.now(timezone.utc)

        return PlanJob(
            process_id=row.process_id,
            consultant_id=row.consultant_id,
            status=PlanJobStatus(row.status),
            error=row.error,
            segments=_json_dict(row.segments),
            failed_attempts=row.failed_attempts,
            findings_snapshot=_json_dict(row.findings_snapshot),
            pre_diagnosis_snapshot=_json_dict(row.pre_diagnosis_snapshot),
            source_updated_at=row.source_updated_at,
            completed_count=row.completed_count,
            created_at=_ts(row.created_at),
            updated_at=_ts(row.updated_at),
        )
