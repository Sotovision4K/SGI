"""Integration tests for `ProcessRepository` plan-job CRUD (Phase 2).

Covers the async job lifecycle against a real in-memory SQLite async engine:
- enqueue (snapshot + idempotent reuse + replace-failed preserving cap count)
- atomic claim guard with ownership verification (first winner only)
- segment checkpointing
- complete/fail transitions + completed_count cap counting
"""

import uuid

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from src.adapters.db.process_repository import ProcessRepository
from src.domain.entities.plan_job import PlanJob, PlanJobStatus, make_default_segments


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


def _make_job(process_id: uuid.UUID | None = None, consultant_id: uuid.UUID | None = None) -> PlanJob:
    return PlanJob(
        process_id=process_id or uuid.uuid4(),
        consultant_id=consultant_id or uuid.uuid4(),
        findings_snapshot={"answers": {"q1": "yes"}},
        pre_diagnosis_snapshot={"company": "Acme"},
        source_updated_at="2026-09-16T10:00:00+00:00",
    )


class TestPlanJobCrud:
    @pytest.mark.asyncio
    async def test_create_job_snapshots_and_defaults(self, repo):
        job = _make_job()

        result = await repo.create_plan_job(job)

        assert result.process_id == job.process_id
        assert result.consultant_id == job.consultant_id
        assert result.status == PlanJobStatus.QUEUED
        assert result.findings_snapshot == {"answers": {"q1": "yes"}}
        assert result.pre_diagnosis_snapshot == {"company": "Acme"}
        assert result.source_updated_at == "2026-09-16T10:00:00+00:00"
        assert result.completed_count == 0
        assert set(result.segments.keys()) == {"B1", "B2", "B3"}

    @pytest.mark.asyncio
    async def test_create_job_is_idempotent_while_queued(self, repo):
        job = _make_job()
        await repo.create_plan_job(job)

        # Duplicate enqueue while still queued must reuse, not disturb.
        duplicate = _make_job(process_id=job.process_id, consultant_id=job.consultant_id)
        duplicate.source_updated_at = "2026-09-17T00:00:00+00:00"  # newer snapshot

        result = await repo.create_plan_job(duplicate)

        # Snapshot must remain the ORIGINAL (not overwritten by the duplicate).
        assert result.source_updated_at == "2026-09-16T10:00:00+00:00"
        assert result.status == PlanJobStatus.QUEUED

    @pytest.mark.asyncio
    async def test_create_job_replaces_failed_and_preserves_count(self, repo):
        job = _make_job()
        await repo.create_plan_job(job)
        await repo.claim_job(job.process_id, job.consultant_id)
        await repo.complete_job(job.process_id)
        assert await repo.get_completed_count(job.process_id) == 1

        # Re-enqueue (regenerate) replaces the completed row → fresh queued job.
        await repo.create_plan_job(_make_job(job.process_id, job.consultant_id))
        assert await repo.claim_job(job.process_id, job.consultant_id) is True
        await repo.fail_job(job.process_id, "boom")

        # Re-enqueue after failure must reset to queued AND keep completed_count.
        replacement = _make_job(job.process_id, job.consultant_id)
        replacement.source_updated_at = "2026-09-18T00:00:00+00:00"
        result = await repo.create_plan_job(replacement)

        assert result.status == PlanJobStatus.QUEUED
        assert result.error is None
        assert result.failed_attempts == 0
        assert result.source_updated_at == "2026-09-18T00:00:00+00:00"
        # Cumulative cap counter preserved across the failed attempt.
        assert result.completed_count == 1


class TestPlanJobClaimGuard:
    @pytest.mark.asyncio
    async def test_claim_first_winner_only(self, repo):
        job = _make_job()
        await repo.create_plan_job(job)

        first = await repo.claim_job(job.process_id, job.consultant_id)
        second = await repo.claim_job(job.process_id, job.consultant_id)

        assert first is True
        assert second is False

        loaded = await repo.get_plan_job(job.process_id)
        assert loaded.status == PlanJobStatus.RUNNING

    @pytest.mark.asyncio
    async def test_claim_rejects_wrong_owner(self, repo):
        job = _make_job()
        await repo.create_plan_job(job)

        wrong_owner = uuid.uuid4()
        assert wrong_owner != job.consultant_id

        claimed = await repo.claim_job(job.process_id, wrong_owner)

        assert claimed is False

        loaded = await repo.get_plan_job(job.process_id)
        assert loaded.status == PlanJobStatus.QUEUED  # untouched by forged claim

    @pytest.mark.asyncio
    async def test_claim_noop_when_job_missing(self, repo):
        assert await repo.claim_job(uuid.uuid4(), uuid.uuid4()) is False


class TestPlanJobTransitions:
    @pytest.mark.asyncio
    async def test_update_segments_persists_checkpoint(self, repo):
        job = _make_job()
        await repo.create_plan_job(job)
        await repo.claim_job(job.process_id, job.consultant_id)

        segments = make_default_segments()
        segments["B1"] = {"status": "done", "tasks": [], "summary": "ok", "error": None}
        await repo.update_job_segments(job.process_id, segments)

        loaded = await repo.get_plan_job(job.process_id)
        assert loaded.segments["B1"]["status"] == "done"
        assert loaded.segments["B2"]["status"] == "pending"

    @pytest.mark.asyncio
    async def test_complete_job_increments_count(self, repo):
        job = _make_job()
        await repo.create_plan_job(job)
        await repo.claim_job(job.process_id, job.consultant_id)

        await repo.complete_job(job.process_id)

        loaded = await repo.get_plan_job(job.process_id)
        assert loaded.status == PlanJobStatus.COMPLETED
        assert loaded.completed_count == 1

    @pytest.mark.asyncio
    async def test_complete_job_only_from_running(self, repo):
        job = _make_job()
        await repo.create_plan_job(job)  # still queued

        await repo.complete_job(job.process_id)

        loaded = await repo.get_plan_job(job.process_id)
        assert loaded.status == PlanJobStatus.QUEUED  # unchanged
        assert loaded.completed_count == 0

    @pytest.mark.asyncio
    async def test_fail_job_stores_error_and_bumps_attempts(self, repo):
        job = _make_job()
        await repo.create_plan_job(job)
        await repo.claim_job(job.process_id, job.consultant_id)

        await repo.fail_job(job.process_id, "LLM timeout")

        loaded = await repo.get_plan_job(job.process_id)
        assert loaded.status == PlanJobStatus.FAILED
        assert loaded.error == "LLM timeout"
        assert loaded.failed_attempts == 1
        # Failed jobs do NOT burn a generation attempt.
        assert loaded.completed_count == 0


class TestPlanJobLookups:
    @pytest.mark.asyncio
    async def test_get_completed_count_default_zero(self, repo):
        assert await repo.get_completed_count(uuid.uuid4()) == 0

    @pytest.mark.asyncio
    async def test_get_active_job_returns_queued_or_running_only(self, repo):
        job = _make_job()
        await repo.create_plan_job(job)

        assert await repo.get_active_job(job.process_id) is not None

        await repo.claim_job(job.process_id, job.consultant_id)
        assert await repo.get_active_job(job.process_id) is not None

        await repo.complete_job(job.process_id)
        assert await repo.get_active_job(job.process_id) is None

    @pytest.mark.asyncio
    async def test_get_plan_job_missing_returns_none(self, repo):
        assert await repo.get_plan_job(uuid.uuid4()) is None
