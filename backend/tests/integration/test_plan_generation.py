"""Integration + unit tests for plan-generation orchestration (Phase 4).

Covers the fan-out → checkpoint → merge → persist pipeline against a real
in-memory SQLite engine, plus the pure `_merge` dedupe/source_clause logic.
"""

import re
import uuid

import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from src.adapters.db.process_repository import ProcessRepository
from src.adapters.llm.llm_port import SegmentResult
from src.domain.entities.plan import Task, TaskPriority
from src.domain.entities.plan_job import PlanJob, PlanJobStatus
from src.domain.entities.process import IsoStandard, Process
from src.errors import (
    InvalidResponseError,
    JobErrorCode,
    LeaseLostError,
    RateLimitError,
    RetryableError,
)
from src.services import plan_generation


_BUCKET_NAMES = {
    "Liderazgo": "B1",
    "Contexto y Apoyo": "B2",
    "Operación y Mejora": "B3",
}


def _bucket_from_prompt(user_prompt: str) -> str:
    m = re.search(r"Bloque de diagnóstico: (.+)", user_prompt)
    return m.group(1).strip() if m else "unknown"


class FakeLLM:
    """LLMPort fake: returns a distinguishable segment per bucket, or raises."""

    def __init__(self, fail: dict[str, Exception] | None = None):
        self.fail = fail or {}  # bucket NAME -> Exception to raise every call
        self.calls: list[str] = []

    async def generate_segment(
        self, system_prompt, user_prompt, *, max_tokens=1500, timeout_seconds=30.0
    ):
        self.calls.append(user_prompt)
        bucket = _bucket_from_prompt(user_prompt)
        if bucket in self.fail:
            raise self.fail[bucket]
        return SegmentResult(
            summary_md=f"Resumen {bucket}",
            tasks=[
                Task(
                    id=uuid.uuid4(),
                    plan_id=uuid.uuid4(),
                    title=f"Tarea {bucket}",
                    description="desc",
                    priority=TaskPriority.MEDIUM,
                    estimated_effort="1 semana",
                    owner_role="rol",
                    sort_order=0,
                )
            ],
            input_tokens=10,
            output_tokens=20,
            latency_ms=100,
        )


@pytest.fixture
async def repo():
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    repository = ProcessRepository.__new__(ProcessRepository)
    repository._engine = engine
    yield repository
    await engine.dispose()


async def _setup_job(repo):
    consultant_id = uuid.uuid4()
    process = Process(
        consultant_id=consultant_id,
        company_id=uuid.uuid4(),
        pre_diagnosis={"pd_target_date": "6-12 meses", "pd_motivation": "Mejora interna"},
        iso_standard=IsoStandard.ISO_9001,
    )
    await repo.create_process(process)
    job = PlanJob(
        process_id=process.id,
        consultant_id=consultant_id,
        findings_snapshot={"answers": {"q_main_processes": "sí"}, "free_text": "notas"},
        pre_diagnosis_snapshot=process.pre_diagnosis,
        source_updated_at="2026-09-17T00:00:00+00:00",
    )
    await repo.create_plan_job(job)
    return process, consultant_id


class TestPlanGenerationPipeline:
    @pytest.mark.asyncio
    async def test_fan_out_and_merge(self, repo):
        process, consultant_id = await _setup_job(repo)
        llm = FakeLLM()

        await plan_generation.generate(process.id, consultant_id, repo, llm, model="test")

        job = await repo.get_plan_job(process.id)
        assert job.status == PlanJobStatus.COMPLETED
        assert job.completed_count == 1
        assert len(llm.calls) == 3

        plan = await repo.get_plan(process.id)
        assert plan is not None
        titles = {t.title for t in plan.tasks}
        assert titles == {
            "Tarea Liderazgo",
            "Tarea Contexto y Apoyo",
            "Tarea Operación y Mejora",
        }
        assert "Resumen Liderazgo" in plan.summary_md

    @pytest.mark.asyncio
    async def test_partial_plan_when_segment_terminal_fails(self, repo):
        process, consultant_id = await _setup_job(repo)
        llm = FakeLLM(fail={"Operación y Mejora": InvalidResponseError("bad")})

        await plan_generation.generate(process.id, consultant_id, repo, llm, model="test")

        job = await repo.get_plan_job(process.id)
        # Partial is valid (decision 18): completed segments persist, B3 failed.
        assert job.status == PlanJobStatus.COMPLETED
        assert job.segments["B3"]["status"] == "failed"

        plan = await repo.get_plan(process.id)
        titles = {t.title for t in plan.tasks}
        assert titles == {"Tarea Liderazgo", "Tarea Contexto y Apoyo"}

    @pytest.mark.asyncio
    async def test_all_fail_marks_job_failed(self, repo):
        process, consultant_id = await _setup_job(repo)
        llm = FakeLLM(fail={name: InvalidResponseError("bad") for name in _BUCKET_NAMES})

        await plan_generation.generate(process.id, consultant_id, repo, llm, model="test")

        job = await repo.get_plan_job(process.id)
        assert job.status == PlanJobStatus.FAILED
        assert job.error == JobErrorCode.SEGMENT_GENERATION_FAILED.value

    @pytest.mark.asyncio
    async def test_retryable_requeues_and_raises(self, repo):
        process, consultant_id = await _setup_job(repo)
        llm = FakeLLM(fail={"Liderazgo": RateLimitError("rate limit")})

        with pytest.raises(RetryableError):
            await plan_generation.generate(process.id, consultant_id, repo, llm, model="test")

        job = await repo.get_plan_job(process.id)
        assert job.status == PlanJobStatus.QUEUED
        assert job.failed_attempts == 1

    @pytest.mark.asyncio
    async def test_checkpoint_resume_skips_completed(self, repo):
        process, consultant_id = await _setup_job(repo)
        # Simulate a crashed prior run: the job was claimed (running), B1 was
        # checkpointed as completed, then the worker released the lease for
        # redelivery (requeue → queued). The checkpoint write itself must go
        # through the `running` lease guard (M3).
        await repo.claim_job(process.id, consultant_id)
        job = await repo.get_plan_job(process.id)
        segments = dict(job.segments)
        segments["B1"] = {
            "status": "completed",
            "summary": "Resumen previo",
            "tasks": [
                {
                    "title": "Tarea previa",
                    "description": "d",
                    "priority": "medium",
                    "estimated_effort": "1d",
                    "owner_role": "r",
                }
            ],
            "error": None,
        }
        await repo.update_job_segments(process.id, segments)
        await repo.requeue_job(process.id)

        llm = FakeLLM()
        await plan_generation.generate(process.id, consultant_id, repo, llm, model="test")

        assert len(llm.calls) == 2  # only B2 and B3 processed
        plan = await repo.get_plan(process.id)
        titles = {t.title for t in plan.tasks}
        assert titles == {
            "Tarea previa",
            "Tarea Contexto y Apoyo",
            "Tarea Operación y Mejora",
        }

    @pytest.mark.asyncio
    async def test_failed_claim_on_running_job_raises_retryable(self, repo):
        # Regression (code-review H1): a redelivered message whose claim loses
        # (another worker holds the lease) must RAISE so SQS redelivers it —
        # returning normally would delete the message and wedge the job.
        process, consultant_id = await _setup_job(repo)
        assert await repo.claim_job(process.id, consultant_id) is True  # queued -> running

        llm = FakeLLM()
        with pytest.raises(RetryableError):
            await plan_generation.generate(process.id, consultant_id, repo, llm, model="test")

        # The message must NOT have been treated as success — job still running.
        job = await repo.get_plan_job(process.id)
        assert job.status == PlanJobStatus.RUNNING

    @pytest.mark.asyncio
    async def test_lease_theft_mid_run_abandons_without_failing(self, repo):
        # Regression (M3): SQS redelivery can put two workers on one job. When
        # a checkpoint write detects the lost lease mid-run, generate() must
        # abandon (return normally, ACKing the message) — NOT fail, complete,
        # requeue, or persist a plan. The thief owns the job now.
        process, consultant_id = await _setup_job(repo)
        llm = FakeLLM()

        original = repo.update_job_segments
        calls = 0

        async def steal_lease_on_second_checkpoint(process_id, segments):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise LeaseLostError("lease stolen mid-run")
            return await original(process_id, segments)

        repo.update_job_segments = steal_lease_on_second_checkpoint

        # Must return normally (no raise) despite the mid-run theft.
        await plan_generation.generate(process.id, consultant_id, repo, llm, model="test")

        job = await repo.get_plan_job(process.id)
        assert job.status == PlanJobStatus.RUNNING  # neither failed nor completed
        assert job.error is None
        assert job.failed_attempts == 0  # requeue_job NOT called
        assert job.completed_count == 0  # complete_job NOT called
        # No plan row was written.
        assert await repo.get_plan(process.id) is None


class TestMerge:
    def test_merge_dedupes_and_stamps_source_clause(self):
        segments = {
            "B1": {
                "status": "completed",
                "summary": "s1",
                "tasks": [
                    {"title": "Tarea A", "description": "d", "priority": "high", "estimated_effort": "1d", "owner_role": "r"},
                    {"title": "Tarea B", "description": "d", "priority": "medium", "estimated_effort": "1d", "owner_role": "r"},
                ],
                "error": None,
            },
            "B2": {
                "status": "completed",
                "summary": "s2",
                "tasks": [
                    {"title": "Tarea A", "description": "d", "priority": "high", "estimated_effort": "1d", "owner_role": "r"},  # dup
                    {"title": "Tarea C", "description": "d", "priority": "low", "estimated_effort": "1d", "owner_role": "r"},
                ],
                "error": None,
            },
            "B3": {"status": "failed", "summary": "", "tasks": [], "error": "x"},
        }
        bucket_clauses = {"B1": ["5.1", "5.2"], "B2": ["4.1"], "B3": []}

        plan = plan_generation._merge(uuid.uuid4(), segments, bucket_clauses)

        assert [t.title for t in plan.tasks] == ["Tarea A", "Tarea B", "Tarea C"]
        assert plan.tasks[0].source_clause == "5.1, 5.2"
        assert plan.tasks[2].source_clause == "4.1"
        assert plan.summary_md == "## Liderazgo\n\ns1\n\n## Contexto y Apoyo\n\ns2"

    def test_merge_skips_failed_and_empty(self):
        segments = {
            "B1": {"status": "failed", "summary": "", "tasks": [], "error": "x"},
            "B2": {"status": "completed", "summary": "", "tasks": [], "error": None},
            "B3": {"status": "pending", "summary": "", "tasks": [], "error": None},
        }
        plan = plan_generation._merge(uuid.uuid4(), segments, {"B1": [], "B2": [], "B3": []})
        assert plan.tasks == []
        assert plan.summary_md == ""

    def test_merge_clamps_document_title_to_200(self):
        # Regression (code-review H2): Postgres enforces VARCHAR(200) on
        # document_title; the merge must clamp so a verbose model can't cause a
        # PLAN_PERSIST_FAILED after all LLM calls.
        segments = {
            "B1": {
                "status": "completed",
                "summary": "s",
                "tasks": [
                    {
                        "title": "t",
                        "description": "d",
                        "priority": "medium",
                        "estimated_effort": "1d",
                        "owner_role": "r",
                        "document_title": "x" * 500,
                    }
                ],
                "error": None,
            },
            "B2": {"status": "pending", "summary": "", "tasks": [], "error": None},
            "B3": {"status": "pending", "summary": "", "tasks": [], "error": None},
        }
        plan = plan_generation._merge(uuid.uuid4(), segments, {"B1": [], "B2": [], "B3": []})
        assert len(plan.tasks) == 1
        assert len(plan.tasks[0].document_title) == 200
