"""Regression tests for process_id lookups in ProcessRepository.

The `findings` and `plans` tables use `id` as the primary key and `process_id`
as a separate (unique, indexed) column. Lookups by process must filter on the
`process_id` column — NOT use `session.get(Table, process_id)`, which resolves
against the `id` primary key and silently misses every row.

These tests capture the SQL the repository emits and assert it filters on the
`process_id` column, guarding against the bug where `get_finding`/`get_plan`
returned None even though the row existed.
"""

import re
import uuid

import pytest
from unittest.mock import MagicMock, patch


def _compile_sql(stmt) -> str:
    """Compile a SQLAlchemy stmt to a literal-binds postgres SQL string."""
    from sqlalchemy.dialects import postgresql

    compiled = stmt.compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"literal_binds": True},
    )
    return re.sub(r"\s+", " ", str(compiled))


class _FakeResult:
    """Result whose scalar_one_or_none() returns None (no existing row)."""

    def scalar_one_or_none(self):
        return None

    def scalars(self):
        return self

    def all(self):
        return []


class _FakeSession:
    """Async session mock capturing execute() statements."""

    def __init__(self, captured: list):
        self._captured = captured

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def execute(self, stmt, *args, **kwargs):
        self._captured.append(stmt)
        return _FakeResult()

    def add(self, row):
        pass

    async def commit(self):
        pass

    async def refresh(self, row):
        pass

    async def delete(self, obj):
        pass

    async def flush(self):
        pass


@pytest.fixture
def repo_with_captured_stmt():
    """Patch AsyncSession + get_engine so execute() is captured with no DB."""
    captured: list = []

    with patch(
        "src.adapters.db.process_repository.AsyncSession",
        side_effect=lambda engine: _FakeSession(captured),
    ), patch(
        "src.adapters.db.process_repository.get_engine", return_value=MagicMock()
    ):
        from src.adapters.db.process_repository import ProcessRepository

        repo = ProcessRepository(database_url="postgresql+asyncpg://u:p@h/db")
        yield repo, captured


class TestFindingLookupFiltersOnProcessId:
    @pytest.mark.asyncio
    async def test_get_finding_filters_on_process_id_column(self, repo_with_captured_stmt):
        repo, captured = repo_with_captured_stmt
        pid = uuid.uuid4()

        result = await repo.get_finding(pid)

        # No row present in the fake DB, so None is the expected outcome…
        assert result is None
        # …but crucially a SELECT was issued (session.get would not call execute).
        assert len(captured) == 1
        sql = _compile_sql(captured[0])
        assert "findings.process_id" in sql
        assert "=" in sql

    @pytest.mark.asyncio
    async def test_upsert_finding_filters_on_process_id_column(self, repo_with_captured_stmt):
        from src.domain.entities.finding import Finding

        repo, captured = repo_with_captured_stmt
        finding = Finding(process_id=uuid.uuid4(), answers={"q1": "x"})

        await repo.upsert_finding(finding)

        assert len(captured) >= 1
        sql = _compile_sql(captured[0])
        assert "findings.process_id" in sql
        assert "=" in sql


class TestPlanLookupFiltersOnProcessId:
    @pytest.mark.asyncio
    async def test_get_plan_filters_on_process_id_column(self, repo_with_captured_stmt):
        repo, captured = repo_with_captured_stmt
        pid = uuid.uuid4()

        result = await repo.get_plan(pid)

        assert result is None
        assert len(captured) == 1
        sql = _compile_sql(captured[0])
        assert "plans.process_id" in sql
        assert "=" in sql

    @pytest.mark.asyncio
    async def test_replace_plan_filters_on_process_id_column(self, repo_with_captured_stmt):
        from src.domain.entities.plan import Plan

        repo, captured = repo_with_captured_stmt
        plan = Plan(process_id=uuid.uuid4(), summary_md="summary", tasks=[])

        await repo.replace_plan(plan)

        assert len(captured) >= 1
        sql = _compile_sql(captured[0])
        assert "plans.process_id" in sql
        assert "=" in sql
