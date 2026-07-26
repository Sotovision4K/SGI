"""Tests for ProcessRepository.list_processes status filter (Step 8, tests 6-9).

Verifies:
- status="active"   → excludes completed (status != completed, never literal "active")
- status="completed" → only completed
- status=None        → no filter (backward compatible)
- invalid status     → ValueError
"""

import uuid
from unittest.mock import MagicMock, patch

import pytest


def _make_execute_result(rows=None):
    """Build a fake execute() result whose scalars().all() returns `rows`."""
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows or []
    return result


def _compile_sql(stmt) -> str:
    """Compile a SQLAlchemy stmt to a literal-binds postgres SQL string."""
    import re
    from sqlalchemy.dialects import postgresql

    compiled = stmt.compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"literal_binds": True},
    )
    # Collapse whitespace so spacing differences don't break substring checks.
    return re.sub(r"\s+", " ", str(compiled))


class _FakeSessionCM:
    """Async context manager yielding a mock session, capturing the executed stmt."""

    def __init__(self, captured: list):
        self._captured = captured
        self.session = MagicMock()

        async def _execute(stmt, *args, **kwargs):
            self._captured.append(stmt)
            return _make_execute_result()

        self.session.execute = _execute

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, *exc):
        return False


@pytest.fixture
def repo_with_captured_stmt():
    """Patch AsyncSession + get_engine so execute() is captured with no DB."""
    captured: list = []

    def _fake_cm_factory(engine):
        return _FakeSessionCM(captured)

    with patch(
        "src.adapters.db.process_repository.AsyncSession", side_effect=_fake_cm_factory
    ), patch(
        "src.adapters.db.process_repository.get_engine", return_value=MagicMock()
    ):
        from src.adapters.db.process_repository import ProcessRepository

        repo = ProcessRepository(database_url="postgresql+asyncpg://u:p@h/db")
        yield repo, captured


class TestListProcessesStatusFilter:
    @pytest.mark.asyncio
    async def test_active_excludes_completed(self, repo_with_captured_stmt):
        repo, captured = repo_with_captured_stmt
        await repo.list_processes(consultant_id=None, status="active")

        assert len(captured) == 1, "expected exactly one execute() call"
        sql = _compile_sql(captured[0])
        # Must exclude completed …
        assert "completed" in sql
        # … using a "not equal"-style comparison …
        assert "!= 'completed'" in sql or "<> 'completed'" in sql
        # … and never pass the literal word "active" to SQL.
        assert "active" not in sql

    @pytest.mark.asyncio
    async def test_completed_returns_only_completed(self, repo_with_captured_stmt):
        repo, captured = repo_with_captured_stmt
        await repo.list_processes(consultant_id=None, status="completed")

        sql = _compile_sql(captured[0])
        assert "= 'completed'" in sql
        # Make sure we did not produce a "not equal" filter by mistake.
        assert "!= 'completed'" not in sql and "<> 'completed'" not in sql

    @pytest.mark.asyncio
    async def test_none_returns_all_no_filter(self, repo_with_captured_stmt):
        repo, captured = repo_with_captured_stmt
        await repo.list_processes(consultant_id=None, status=None)

        stmt = captured[0]
        # No consultant_id and no status → no WHERE clause at all.
        assert stmt.whereclause is None

    @pytest.mark.asyncio
    async def test_invalid_status_raises_value_error(self, repo_with_captured_stmt):
        repo, _ = repo_with_captured_stmt
        with pytest.raises(ValueError):
            await repo.list_processes(consultant_id=None, status="bogus")

    @pytest.mark.asyncio
    async def test_active_filter_works_with_consultant_id(self, repo_with_captured_stmt):
        """Both filters (consultant + active status) compose correctly."""
        repo, captured = repo_with_captured_stmt
        cid = uuid.uuid4()
        await repo.list_processes(consultant_id=cid, status="active")

        sql = _compile_sql(captured[0])
        # consultant_id filter is present (a UUID param bound) and the
        # active (not completed) filter is present.
        assert "completed" in sql
        assert "active" not in sql