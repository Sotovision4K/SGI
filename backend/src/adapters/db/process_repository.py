import json
import logging
import uuid

from sqlmodel import SQLModel, Field, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.process import Process, ProcessStatus, IsoStandard
from src.domain.entities.finding import Finding
from src.domain.entities.plan import Plan, Task, TaskPriority
from src.domain.entities.audit_log import AuditLogLLM
from src.adapters.db.user_repository import CompanyTable, get_engine

logger = logging.getLogger(__name__)


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


class ProcessRepository:
    """Repository for Process, Finding, Plan, and Task tables.

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
        import json
        async with AsyncSession(self._engine) as session:
            row = (
                await session.execute(
                    select(FindingTable).where(FindingTable.process_id == process_id)
                )
            ).scalar_one_or_none()
            if row is None:
                return None
            try:
                answers = json.loads(row.answers) if row.answers else {}
            except json.JSONDecodeError:
                answers = {}
            return Finding(
                id=row.id,
                process_id=row.process_id,
                answers=answers,
                free_text=row.free_text,
            )

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

            plan_row = PlanTable(
                id=plan.id,
                process_id=plan.process_id,
                summary_md=plan.summary_md,
                generated_at=datetime.now(timezone.utc).isoformat(),
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
                ))
            await session.commit()
            return self._plan_to_domain(plan_row, plan.tasks)

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
                exc,
            )
            return audit

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
