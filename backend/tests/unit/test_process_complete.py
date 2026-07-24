"""Tests for complete/reopen process endpoints (Step 8, tests 10-14).

NOTE on test 14 (non-owner): the existing `_require_process_owner` helper
returns 404 for both missing and non-owned processes (to avoid leaking the
existence of a resource — security-by-obscurity pattern established across
the routes). The spec text mentions "(403)" but instructs us to reuse
`_require_process_owner`, which raises 404. We assert 404 to stay consistent
with the established helper contract and existing tests.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from src.domain.entities.process import Process, ProcessStatus, IsoStandard


def _make_process(
    owner_sub: str,
    status: ProcessStatus = ProcessStatus.IN_PROGRESS,
) -> Process:
    return Process(
        id=uuid.uuid4(),
        consultant_id=uuid.UUID(owner_sub),
        company_id=uuid.uuid4(),
        pre_diagnosis={},
        iso_standard=IsoStandard.ISO_9001,
        status=status,
    )


@pytest.fixture
def owner_sub():
    return str(uuid.uuid4())


@pytest.fixture
def mock_settings():
    s = MagicMock()
    s.database_url = "postgresql+asyncpg://u:p@h/db"
    return s


@pytest.fixture
def patched_hydrate():
    """Patch _hydrate_company_name so route tests need no DB engine."""
    with patch(
        "src.routes.processes.routes._hydrate_company_name",
        new=AsyncMock(return_value="Acme SA"),
    ) as m:
        yield m


class TestCompleteProcess:
    @pytest.mark.asyncio
    async def test_complete_sets_status_to_completed(
        self, owner_sub, mock_settings, patched_hydrate
    ):
        from src.routes.processes.routes import complete_process

        process = _make_process(owner_sub, status=ProcessStatus.IN_PROGRESS)
        repo = AsyncMock()
        repo.get_process = AsyncMock(return_value=process)
        # After update, return a completed process.
        completed = _make_process(owner_sub, status=ProcessStatus.COMPLETED)
        completed.id = process.id
        completed.company_id = process.company_id
        repo.get_process = AsyncMock(side_effect=[process, completed])

        current_user = {"sub": owner_sub}
        result = await complete_process(process.id, current_user, repo, mock_settings)

        # The repo setter was called with COMPLETED.
        repo.update_process_status.assert_awaited_once_with(
            process.id, ProcessStatus.COMPLETED
        )
        assert result.status == ProcessStatus.COMPLETED.value

    @pytest.mark.asyncio
    async def test_complete_on_already_completed_returns_409(
        self, owner_sub, mock_settings, patched_hydrate
    ):
        from src.routes.processes.routes import complete_process

        process = _make_process(owner_sub, status=ProcessStatus.COMPLETED)
        repo = AsyncMock()
        repo.get_process = AsyncMock(return_value=process)

        with pytest.raises(HTTPException) as exc_info:
            await complete_process(process.id, {"sub": owner_sub}, repo, mock_settings)

        assert exc_info.value.status_code == 409
        # Setter must NOT be called when already completed.
        repo.update_process_status.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_non_owner_cannot_complete_returns_404(
        self, owner_sub, mock_settings, patched_hydrate
    ):
        from src.routes.processes.routes import complete_process

        other_sub = str(uuid.uuid4())
        process = _make_process(other_sub, status=ProcessStatus.IN_PROGRESS)
        repo = AsyncMock()
        repo.get_process = AsyncMock(return_value=process)

        with pytest.raises(HTTPException) as exc_info:
            await complete_process(process.id, {"sub": owner_sub}, repo, mock_settings)

        # _require_process_owner raises 404 (does not leak resource existence).
        assert exc_info.value.status_code == 404
        repo.update_process_status.assert_not_awaited()


class TestReopenProcess:
    @pytest.mark.asyncio
    async def test_reopen_sets_status_to_in_progress(
        self, owner_sub, mock_settings, patched_hydrate
    ):
        from src.routes.processes.routes import reopen_process

        process = _make_process(owner_sub, status=ProcessStatus.COMPLETED)
        reopened = _make_process(owner_sub, status=ProcessStatus.IN_PROGRESS)
        reopened.id = process.id
        reopened.company_id = process.company_id
        repo = AsyncMock()
        repo.get_process = AsyncMock(side_effect=[process, reopened])

        result = await reopen_process(process.id, {"sub": owner_sub}, repo, mock_settings)

        repo.update_process_status.assert_awaited_once_with(
            process.id, ProcessStatus.IN_PROGRESS
        )
        assert result.status == ProcessStatus.IN_PROGRESS.value

    @pytest.mark.asyncio
    async def test_reopen_on_non_completed_returns_409(
        self, owner_sub, mock_settings, patched_hydrate
    ):
        from src.routes.processes.routes import reopen_process

        process = _make_process(owner_sub, status=ProcessStatus.IN_PROGRESS)
        repo = AsyncMock()
        repo.get_process = AsyncMock(return_value=process)

        with pytest.raises(HTTPException) as exc_info:
            await reopen_process(process.id, {"sub": owner_sub}, repo, mock_settings)

        assert exc_info.value.status_code == 409
        repo.update_process_status.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_reopen_on_in_diagnosis_returns_409(
        self, owner_sub, mock_settings, patched_hydrate
    ):
        """Any non-completed status (incl. plan_ready) is not reopenable."""
        from src.routes.processes.routes import reopen_process

        process = _make_process(owner_sub, status=ProcessStatus.PLAN_READY)
        repo = AsyncMock()
        repo.get_process = AsyncMock(return_value=process)

        with pytest.raises(HTTPException) as exc_info:
            await reopen_process(process.id, {"sub": owner_sub}, repo, mock_settings)

        assert exc_info.value.status_code == 409