"""Repository tests for perfilamiento answers and LLM analysis persistence.

Covers Phase 3 of the perfilamiento wizard refactor:
- update_perfilamiento merges pain_points into perfilamiento_answers and moves
  PROFILING_PENDING → IN_DIAGNOSIS without downgrading later statuses.
- update_analysis stores a validated ProfilingResult dict and moves a
  post-perfilamiento process (IN_DIAGNOSIS / IN_PROGRESS / PLAN_READY) to
  PLAN_READY, never skipping straight from PROFILING_PENDING and never
  downgrading COMPLETED.
- Not-found raises ProcessNotFoundError for the update methods.
"""

import json
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from src.adapters.db.process_repository import ProcessRepository, ProcessTable
from src.domain.entities.process import IsoStandard, Process, ProcessStatus
from src.errors import ProcessNotFoundError


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


async def _process_row(repo, process_id: uuid.UUID) -> ProcessTable | None:
    async with AsyncSession(repo._engine) as session:
        return await session.get(ProcessTable, process_id)


class TestUpdatePerfilamiento:
    @pytest.mark.asyncio
    async def test_merges_pain_points_and_advances_profiling_pending(self, repo):
        process = Process(
            consultant_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            iso_standard=IsoStandard.ISO_9001,
            status=ProcessStatus.PROFILING_PENDING,
        )
        await repo.create_process(process)

        answers = {"opt_01": "Sí", "opt_02": "No"}
        saved = await repo.update_perfilamiento(
            process.id, answers, pain_points="Falta documentar procesos"
        )

        assert saved.perfilamiento_answers == {
            "opt_01": "Sí",
            "opt_02": "No",
            "pain_points": "Falta documentar procesos",
        }

        row = await _process_row(repo, process.id)
        assert row is not None
        assert row.status == ProcessStatus.IN_DIAGNOSIS.value
        stored = json.loads(row.perfilamiento_answers)
        assert stored["pain_points"] == "Falta documentar procesos"

    @pytest.mark.asyncio
    async def test_does_not_downgrade_plan_ready(self, repo):
        process = Process(
            consultant_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            iso_standard=IsoStandard.ISO_9001,
            status=ProcessStatus.PLAN_READY,
        )
        await repo.create_process(process)

        await repo.update_perfilamiento(process.id, {"opt_01": "Sí"}, "sin dolor")

        row = await _process_row(repo, process.id)
        assert row is not None
        assert row.status == ProcessStatus.PLAN_READY.value


class TestUpdateAnalysis:
    @pytest.mark.asyncio
    async def test_round_trips_and_advances_in_diagnosis_to_plan_ready(self, repo):
        process = Process(
            consultant_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            iso_standard=IsoStandard.ISO_9001,
            status=ProcessStatus.IN_DIAGNOSIS,
        )
        await repo.create_process(process)

        analysis = {
            "pain_points_analysis": "## Crítico",
            "cost_estimation": {
                "range_cop": "30M",
                "breakdown": ["Consultoría"],
                "confidence": "high",
            },
            "time_estimation": {
                "months": 6,
                "phases": ["Fase 1"],
                "confidence": "medium",
            },
            "action_plan": {
                "phases": [
                    {"name": "Diagnóstico", "duration_weeks": 4, "activities": ["x"]}
                ],
                "milestones": ["Hito"],
            },
        }

        saved = await repo.update_analysis(process.id, analysis)

        assert saved.analysis_result == analysis

        row = await _process_row(repo, process.id)
        assert row is not None
        assert row.status == ProcessStatus.PLAN_READY.value
        assert json.loads(row.analysis_result) == analysis

    @pytest.mark.asyncio
    async def test_does_not_downgrade_completed(self, repo):
        process = Process(
            consultant_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            iso_standard=IsoStandard.ISO_9001,
            status=ProcessStatus.COMPLETED,
        )
        await repo.create_process(process)

        await repo.update_analysis(process.id, {"pain_points_analysis": "x"})

        row = await _process_row(repo, process.id)
        assert row is not None
        assert row.status == ProcessStatus.COMPLETED.value

    @pytest.mark.asyncio
    async def test_does_not_skip_from_profiling_pending(self, repo):
        """Analysis cannot fast-forward a process that has no perfilamiento yet."""
        process = Process(
            consultant_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            iso_standard=IsoStandard.ISO_9001,
            status=ProcessStatus.PROFILING_PENDING,
        )
        await repo.create_process(process)

        await repo.update_analysis(process.id, {"pain_points_analysis": "x"})

        row = await _process_row(repo, process.id)
        assert row is not None
        assert row.status == ProcessStatus.PROFILING_PENDING.value

    @pytest.mark.asyncio
    async def test_advances_in_progress_to_plan_ready(self, repo):
        """IN_PROGRESS → PLAN_READY is a valid forward transition."""
        process = Process(
            consultant_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            iso_standard=IsoStandard.ISO_9001,
            status=ProcessStatus.IN_PROGRESS,
        )
        await repo.create_process(process)

        await repo.update_analysis(process.id, {"pain_points_analysis": "x"})

        row = await _process_row(repo, process.id)
        assert row is not None
        assert row.status == ProcessStatus.PLAN_READY.value


class TestNeedsCertification:
    @pytest.mark.asyncio
    async def test_round_trips_needs_certification_true(self, repo):
        process = Process(
            consultant_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            needs_certification=True,
        )
        saved = await repo.create_process(process)

        assert saved.needs_certification is True

        row = await _process_row(repo, process.id)
        assert row is not None
        assert row.needs_certification is True

    @pytest.mark.asyncio
    async def test_defaults_needs_certification_false(self, repo):
        process = Process(
            consultant_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
        )
        saved = await repo.create_process(process)

        assert saved.needs_certification is False

        row = await _process_row(repo, process.id)
        assert row is not None
        assert row.needs_certification is False

    @pytest.mark.asyncio
    async def test_update_needs_certification_round_trips(self, repo):
        process = Process(
            consultant_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            needs_certification=False,
        )
        await repo.create_process(process)

        saved = await repo.update_needs_certification(process.id, True)

        assert saved.needs_certification is True
        row = await _process_row(repo, process.id)
        assert row is not None
        assert row.needs_certification is True

        toggled = await repo.update_needs_certification(process.id, False)

        assert toggled.needs_certification is False
        row = await _process_row(repo, process.id)
        assert row is not None
        assert row.needs_certification is False


class TestNotFound:
    @pytest.mark.asyncio
    async def test_update_perfilamiento_missing_raises(self, repo):
        with pytest.raises(ProcessNotFoundError):
            await repo.update_perfilamiento(uuid.uuid4(), {}, "")

    @pytest.mark.asyncio
    async def test_update_analysis_missing_raises(self, repo):
        with pytest.raises(ProcessNotFoundError):
            await repo.update_analysis(uuid.uuid4(), {})

    @pytest.mark.asyncio
    async def test_update_needs_certification_missing_raises(self, repo):
        with pytest.raises(ProcessNotFoundError):
            await repo.update_needs_certification(uuid.uuid4(), True)
