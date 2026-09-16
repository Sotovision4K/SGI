"""Regression tests for `ProcessRepository.replace_plan`.

Covers the `MissingGreenlet` bug: after `session.commit()`, SQLAlchemy expires
the ORM objects (`expire_on_commit=True`). The old code passed the expired
`plan_row` back into `_plan_to_domain`, whose attribute reads triggered a
lazy-load refresh — async IO in a sync context — raising
`sqlalchemy.exc.MissingGreenlet`.

These tests run against a real in-memory SQLite async engine (aiosqlite), so a
revert to `return self._plan_to_domain(plan_row, plan.tasks)` fails loudly.
"""

import uuid

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from src.adapters.db.process_repository import ProcessRepository
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


def _make_plan() -> Plan:
    plan_id = uuid.uuid4()
    return Plan(
        id=plan_id,
        process_id=uuid.uuid4(),
        summary_md="Resumen del plan.",
        tasks=[
            Task(
                plan_id=plan_id,
                title="Documentar política de calidad",
                description="Crear el documento.",
                priority=TaskPriority.HIGH,
                estimated_effort="1 semana",
                owner_role="Gerente de Calidad",
                sort_order=0,
                source_clause="5.2",
                require_document=True,
                document_title="Política de Calidad",
            ),
            Task(
                plan_id=plan_id,
                title="Evaluar riesgos operacionales",
                priority=TaskPriority.MEDIUM,
                sort_order=1,
                source_clause="8.1",
                require_document=False,
                document_title=None,
            ),
        ],
    )


class TestReplacePlanRegression:
    @pytest.mark.asyncio
    async def test_replace_plan_returns_plan_without_lazy_load(self, repo):
        plan = _make_plan()

        result = await repo.replace_plan(plan)

        assert result.id == plan.id
        assert result.process_id == plan.process_id
        assert result.summary_md == plan.summary_md
        assert len(result.tasks) == 2

    @pytest.mark.asyncio
    async def test_replace_plan_persists_phase1_task_fields(self, repo):
        plan = _make_plan()

        await repo.replace_plan(plan)

        loaded = await repo.get_plan(plan.process_id)
        assert loaded is not None
        assert len(loaded.tasks) == 2

        first = loaded.tasks[0]
        assert first.source_clause == "5.2"
        assert first.require_document is True
        assert first.document_title == "Política de Calidad"

        second = loaded.tasks[1]
        assert second.source_clause == "8.1"
        assert second.require_document is False
        assert second.document_title is None

    @pytest.mark.asyncio
    async def test_replace_plan_overwrites_existing_plan(self, repo):
        plan = _make_plan()

        await repo.replace_plan(plan)
        replacement = _make_plan()
        replacement.process_id = plan.process_id

        await repo.replace_plan(replacement)

        loaded = await repo.get_plan(plan.process_id)
        assert loaded is not None
        assert loaded.id == replacement.id
        assert len(loaded.tasks) == 2
