import uuid

from sqlmodel import SQLModel, Field, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.entities.process import Process, ProcessStatus, IsoStandard
from src.domain.entities.finding import Finding
from src.domain.entities.plan import Plan, Task, TaskPriority
from src.adapters.db.user_repository import get_engine


class ProcessTable(SQLModel, table=True):
    __tablename__ = "processes"

    id: uuid.UUID = Field(primary_key=True)
    consultant_id: uuid.UUID = Field(index=True)
    company_id: uuid.UUID = Field(index=True)
    iso_standard: str = Field(max_length=20, index=True)
    status: str = Field(max_length=20, default="in_diagnosis", index=True)
    created_at: str
    updated_at: str


class FindingTable(SQLModel, table=True):
    __tablename__ = "findings"

    id: uuid.UUID = Field(primary_key=True)
    process_id: uuid.UUID = Field(unique=True, index=True)
    answers: str = Field(default="{}")
    free_text: str = Field(default="")
    updated_at: str


class PlanTable(SQLModel, table=True):
    __tablename__ = "plans"

    id: uuid.UUID = Field(primary_key=True)
    process_id: uuid.UUID = Field(unique=True, index=True)
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


class ProcessRepository:
    """Repository for Process, Finding, Plan, and Task tables.

    Co-located because they share a tight lifecycle and live in the same DB.
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

    async def list_processes(self, consultant_id: uuid.UUID | None = None) -> list[Process]:
        async with AsyncSession(self._engine) as session:
            stmt = select(ProcessTable).order_by(ProcessTable.created_at.desc())
            if consultant_id is not None:
                stmt = stmt.where(ProcessTable.consultant_id == consultant_id)
            rows = (await session.execute(stmt)).scalars().all()
            return [self._process_to_domain(r) for r in rows]

    async def update_process_status(self, process_id: uuid.UUID, status: ProcessStatus) -> None:
        from datetime import datetime, timezone
        async with AsyncSession(self._engine) as session:
            row = await session.get(ProcessTable, process_id)
            if row is None:
                raise ValueError("Process not found")
            row.status = status.value
            row.updated_at = datetime.now(timezone.utc).isoformat()
            await session.commit()

    # ---- Findings ---------------------------------------------------------

    async def upsert_finding(self, finding: Finding) -> Finding:
        import json
        from datetime import datetime, timezone
        async with AsyncSession(self._engine) as session:
            row = await session.get(FindingTable, finding.process_id)
            if row is None:
                row = FindingTable(
                    id=finding.id,
                    process_id=finding.process_id,
                    answers=json.dumps(finding.answers, ensure_ascii=False),
                    free_text=finding.free_text,
                    updated_at=datetime.now(timezone.utc).isoformat(),
                )
                session.add(row)
            else:
                row.answers = json.dumps(finding.answers, ensure_ascii=False)
                row.free_text = finding.free_text
                row.updated_at = datetime.now(timezone.utc).isoformat()
            await session.commit()
            await session.refresh(row)
            return self._finding_to_domain(row)

    async def get_finding(self, process_id: uuid.UUID) -> Finding | None:
        import json
        async with AsyncSession(self._engine) as session:
            row = await session.get(FindingTable, process_id)
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
            existing = await session.get(PlanTable, plan.process_id)
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
            plan_row = await session.get(PlanTable, process_id)
            if plan_row is None:
                return None
            task_rows = (await session.execute(
                select(TaskTable).where(TaskTable.plan_id == plan_row.id).order_by(TaskTable.sort_order)
            )).scalars().all()
            tasks = [self._task_to_domain(t) for t in task_rows]
            return self._plan_to_domain(plan_row, tasks)

    # ---- Mappers ----------------------------------------------------------

    @staticmethod
    def _process_to_domain(row: ProcessTable) -> Process:
        from datetime import datetime
        return Process(
            id=row.id,
            consultant_id=row.consultant_id,
            company_id=row.company_id,
            iso_standard=IsoStandard(row.iso_standard),
            status=ProcessStatus(row.status),
            created_at=datetime.fromisoformat(row.created_at),
            updated_at=datetime.fromisoformat(row.updated_at),
        )

    @staticmethod
    def _finding_to_domain(row: FindingTable) -> Finding:
        import json
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
