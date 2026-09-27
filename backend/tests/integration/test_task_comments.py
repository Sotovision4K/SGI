"""Repository tests for kanban task comments and the pre-diagnosis status transition.

Covers:
- add/list comments scoped to the caller's process (IDOR-safe → None for foreign)
- ordered listing, empty list for a task with no comments
- update_pre_diagnosis advances in_diagnosis → in_progress without downgrading
"""

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, select

from src.adapters.db.process_repository import ProcessRepository, ProcessTable
from src.domain.entities.plan import Plan, Task, TaskPriority
from src.domain.entities.process import IsoStandard, Process, ProcessStatus


@pytest.fixture
async def repo():
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    repository = ProcessRepository.__new__(ProcessRepository)
    repository._engine = engine
    yield repository
    await engine.dispose()


def _make_plan() -> tuple[Plan, Task]:
    plan_id = uuid.uuid4()
    task = Task(
        id=uuid.uuid4(),
        plan_id=plan_id,
        title="Documentar política de calidad",
        description="Crear el documento.",
        priority=TaskPriority.MEDIUM,
        sort_order=0,
    )
    plan = Plan(
        id=plan_id,
        process_id=uuid.uuid4(),
        summary_md="",
        tasks=[task],
    )
    return plan, task


async def _process_row(repo, process_id: uuid.UUID) -> ProcessTable | None:
    async with AsyncSession(repo._engine) as session:
        return await session.get(ProcessTable, process_id)


class TestTaskComments:
    @pytest.mark.asyncio
    async def test_add_and_list_comments(self, repo):
        plan, task = _make_plan()
        await repo.replace_plan(plan)
        author = uuid.uuid4()

        created = await repo.add_task_comment(plan.process_id, task.id, author, "Primer comentario")
        assert created is not None
        assert created.body == "Primer comentario"
        assert created.author_id == author

        comments = await repo.list_task_comments(plan.process_id, task.id)
        assert comments is not None
        assert [c.body for c in comments] == ["Primer comentario"]

    @pytest.mark.asyncio
    async def test_list_comments_empty_for_task_without_comments(self, repo):
        plan, task = _make_plan()
        await repo.replace_plan(plan)

        comments = await repo.list_task_comments(plan.process_id, task.id)
        assert comments == []

    @pytest.mark.asyncio
    async def test_comments_ordered_by_created_at(self, repo):
        plan, task = _make_plan()
        await repo.replace_plan(plan)
        author = uuid.uuid4()
        await repo.add_task_comment(plan.process_id, task.id, author, "uno")
        await repo.add_task_comment(plan.process_id, task.id, author, "dos")

        comments = await repo.list_task_comments(plan.process_id, task.id)
        assert [c.body for c in comments] == ["uno", "dos"]

    @pytest.mark.asyncio
    async def test_comment_on_foreign_process_is_invisible(self, repo):
        plan, task = _make_plan()
        await repo.replace_plan(plan)

        other_process = uuid.uuid4()
        assert await repo.list_task_comments(other_process, task.id) is None
        assert await repo.add_task_comment(other_process, task.id, uuid.uuid4(), "x") is None

    @pytest.mark.asyncio
    async def test_comment_on_missing_plan_returns_none(self, repo):
        assert await repo.list_task_comments(uuid.uuid4(), uuid.uuid4()) is None
        assert await repo.add_task_comment(uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), "x") is None


class TestPreDiagnosisStatusTransition:
    @pytest.mark.asyncio
    async def test_pre_diagnosis_advances_in_diagnosis_to_in_progress(self, repo):
        process = Process(
            consultant_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            iso_standard=IsoStandard.ISO_9001,
            status=ProcessStatus.IN_DIAGNOSIS,
        )
        await repo.create_process(process)

        await repo.update_pre_diagnosis(process.id, {"pd_employees": "11-50"})

        row = await _process_row(repo, process.id)
        assert row is not None
        assert row.status == ProcessStatus.IN_PROGRESS.value

    @pytest.mark.asyncio
    async def test_pre_diagnosis_does_not_downgrade_plan_ready(self, repo):
        process = Process(
            consultant_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            iso_standard=IsoStandard.ISO_9001,
            status=ProcessStatus.PLAN_READY,
        )
        await repo.create_process(process)

        await repo.update_pre_diagnosis(process.id, {"pd_employees": "11-50"})

        row = await _process_row(repo, process.id)
        assert row is not None
        assert row.status == ProcessStatus.PLAN_READY.value
