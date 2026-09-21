"""Integration tests for `ProcessRepository.patch_task` (Phase 6, editable tasks).

Runs against a real in-memory SQLite async engine (aiosqlite), mirroring the
fixtures in test_replace_plan.py / test_plan_job.py.

Covers:
- partial-update semantics (only provided fields change)
- None-value skipping (except nullable document_title, which None clears)
- ownership scoping: a task under another process's plan is invisible (None)
- plan-level edit metadata: replace_plan resets revision=0; each patch bumps
  revision (+1) and refreshes updated_at
- defensive priority handling: a TaskPriority enum is persisted as its string
"""

import uuid
from datetime import datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, select

from src.adapters.db.process_repository import PlanTable, ProcessRepository, TaskTable
from src.domain.entities.plan import Plan, Task, TaskPriority


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


def _make_plan(process_id: uuid.UUID | None = None) -> tuple[Plan, Task]:
    """A one-task plan; returns (plan, task) so tests can address the task id."""
    plan_id = uuid.uuid4()
    task = Task(
        id=uuid.uuid4(),
        plan_id=plan_id,
        title="Documentar política de calidad",
        description="Crear el documento.",
        priority=TaskPriority.MEDIUM,
        estimated_effort="1 semana",
        owner_role="Gerente de Calidad",
        sort_order=0,
        source_clause="5.2",
        require_document=True,
        document_title="Política de Calidad",
    )
    plan = Plan(
        id=plan_id,
        process_id=process_id or uuid.uuid4(),
        summary_md="Resumen del plan.",
        tasks=[task],
    )
    return plan, task


async def _plan_row(repo, process_id: uuid.UUID) -> PlanTable | None:
    async with AsyncSession(repo._engine) as session:
        stmt = select(PlanTable).where(PlanTable.process_id == process_id)
        return (await session.execute(stmt)).scalar_one_or_none()


async def _task_row(repo, task_id: uuid.UUID) -> TaskTable | None:
    async with AsyncSession(repo._engine) as session:
        return await session.get(TaskTable, task_id)


class TestPatchTask:
    @pytest.mark.asyncio
    async def test_patch_task_updates_only_provided_fields(self, repo):
        plan, task = _make_plan()
        await repo.replace_plan(plan)

        updated = await repo.patch_task(
            plan.process_id, task.id, {"title": "Nuevo título", "estimated_effort": "2 días"}
        )

        assert updated is not None
        assert updated.title == "Nuevo título"
        assert updated.estimated_effort == "2 días"
        # Untouched fields keep their original values.
        assert updated.description == "Crear el documento."
        assert updated.priority is TaskPriority.MEDIUM
        assert updated.owner_role == "Gerente de Calidad"
        assert updated.sort_order == 0
        assert updated.source_clause == "5.2"
        assert updated.require_document is True
        assert updated.document_title == "Política de Calidad"

    @pytest.mark.asyncio
    async def test_patch_task_returns_none_when_plan_missing(self, repo):
        result = await repo.patch_task(uuid.uuid4(), uuid.uuid4(), {"title": "x"})
        assert result is None

    @pytest.mark.asyncio
    async def test_patch_task_returns_none_when_task_belongs_to_other_plan(self, repo):
        plan_a, task_a = _make_plan()
        plan_b, _task_b = _make_plan()
        await repo.replace_plan(plan_a)
        await repo.replace_plan(plan_b)

        # task_a lives under plan_a — addressing it via plan_b's process fails…
        result = await repo.patch_task(plan_b.process_id, task_a.id, {"title": "hack"})
        assert result is None

        # …and must not have modified task_a.
        loaded = await repo.get_plan(plan_a.process_id)
        assert loaded is not None
        assert loaded.tasks[0].title == "Documentar política de calidad"

    @pytest.mark.asyncio
    async def test_patch_task_bumps_plan_revision_and_updated_at(self, repo):
        plan, task = _make_plan()
        await repo.replace_plan(plan)

        # replace_plan writes LLM-generation metadata: revision 0, fresh timestamp.
        row = await _plan_row(repo, plan.process_id)
        assert row is not None
        assert row.revision == 0
        assert row.updated_at != ""

        first = await repo.patch_task(plan.process_id, task.id, {"title": "edit 1"})
        second = await repo.patch_task(plan.process_id, task.id, {"title": "edit 2"})
        assert first is not None
        assert second is not None

        row = await _plan_row(repo, plan.process_id)
        assert row is not None
        assert row.revision == 2  # +1 per hand-edit
        assert row.updated_at != ""
        # The timestamp is a parseable ISO 8601 string.
        datetime.fromisoformat(row.updated_at)

    @pytest.mark.asyncio
    async def test_patch_task_clears_document_title_with_none(self, repo):
        plan, task = _make_plan()
        await repo.replace_plan(plan)

        updated = await repo.patch_task(plan.process_id, task.id, {"document_title": None})

        assert updated is not None
        assert updated.document_title is None

    @pytest.mark.asyncio
    async def test_patch_task_preserves_document_title_when_not_in_updates(self, repo):
        plan, task = _make_plan()
        await repo.replace_plan(plan)

        updated = await repo.patch_task(plan.process_id, task.id, {"title": "otro"})

        assert updated is not None
        assert updated.document_title == "Política de Calidad"

    @pytest.mark.asyncio
    async def test_patch_task_skips_none_values_for_non_nullable_fields(self, repo):
        plan, task = _make_plan()
        await repo.replace_plan(plan)

        # Explicit nulls on non-nullable fields mean "not provided" — skipped.
        updated = await repo.patch_task(
            plan.process_id, task.id, {"title": None, "description": "Nueva descripción"}
        )

        assert updated is not None
        assert updated.title == "Documentar política de calidad"
        assert updated.description == "Nueva descripción"

    @pytest.mark.asyncio
    async def test_patch_task_persists_priority_enum_as_string(self, repo):
        plan, task = _make_plan()
        await repo.replace_plan(plan)

        # The route normally converts priority to str, but patch_task must also
        # accept a raw TaskPriority enum defensively.
        updated = await repo.patch_task(
            plan.process_id, task.id, {"priority": TaskPriority.HIGH}
        )

        assert updated is not None
        assert updated.priority is TaskPriority.HIGH
        row = await _task_row(repo, task.id)
        assert row is not None
        assert row.priority == "high"  # stored as the plain string value
