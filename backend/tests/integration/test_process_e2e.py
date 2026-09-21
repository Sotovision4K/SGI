"""Process-level e2e test (decision 21).

Exercises the full wiring without AWS/Anthropic/Postgres:
`POST /generate-plan` (capturing queue) → `run_plan_generation` (fake LLM,
real SQLite repo) → merge → `replace_plan` → `GET /plan` + `GET /plan-generation/status`.
"""

import uuid
from unittest.mock import MagicMock, patch

import httpx
import pytest
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel

from src.adapters.db.process_repository import ProcessRepository
from src.adapters.llm.llm_port import SegmentResult
from src.domain.entities.finding import Finding
from src.domain.entities.plan import Task, TaskPriority
from src.domain.entities.process import IsoStandard, Process


class _FakeLLM:
    """Returns one distinguishable task per bucket (title carries the bucket)."""

    async def generate_segment(
        self, system_prompt, user_prompt, *, max_tokens=4096, timeout_seconds=180.0
    ):
        # Derive the bucket name from the user prompt ("Bloque de diagnóstico: <name>").
        import re

        m = re.search(r"Bloque de diagnóstico: (.+)", user_prompt)
        bucket = m.group(1).strip() if m else "unknown"
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


class _CapturingQueue:
    def __init__(self):
        self.messages = []

    async def enqueue_plan_generation(self, process_id, consultant_id):
        self.messages.append(
            {"process_id": str(process_id), "consultant_id": str(consultant_id)}
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


@pytest.mark.asyncio
async def test_full_pipeline_route_to_plan(repo):
    # 1. Seed a process + findings.
    consultant_id = uuid.uuid4()
    process = Process(
        consultant_id=consultant_id,
        company_id=uuid.uuid4(),
        pre_diagnosis={"pd_target_date": "6-12 meses"},
        iso_standard=IsoStandard.ISO_9001,
    )
    await repo.create_process(process)
    await repo.upsert_finding(
        Finding(process_id=process.id, answers={"q_main_processes": "sí"}, free_text="notas")
    )

    queue = _CapturingQueue()
    settings = MagicMock()
    settings.anthropic_model = "test"

    with patch("src.config.settings.get_settings", return_value=settings), patch(
        "src.workers.plan_generation_worker.get_settings", return_value=settings
    ):
        from src.main import app
        from src.routes.processes.routes import (
            get_process_repository,
            get_queue_adapter,
        )
        from src.routes.user.auth import get_current_user
        from src.workers.plan_generation_worker import run_plan_generation

        app.dependency_overrides[get_process_repository] = lambda: repo
        app.dependency_overrides[get_queue_adapter] = lambda: queue
        app.dependency_overrides[get_current_user] = lambda: {"sub": str(consultant_id)}

        try:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                # 2. Enqueue (async route → 202 + one captured SQS message).
                r = await client.post(f"/processes/{process.id}/generate-plan")
                assert r.status_code == 202, r.text
                assert len(queue.messages) == 1
                assert queue.messages[0]["process_id"] == str(process.id)
                assert queue.messages[0]["consultant_id"] == str(consultant_id)

                # 3. Worker (fake LLM) — simulate the SQS-triggered invocation.
                await run_plan_generation(
                    process.id, consultant_id, repo=repo, llm=_FakeLLM()
                )

                # 4. Plan is persisted and readable through the HTTP surface.
                r = await client.get(f"/processes/{process.id}/plan")
                assert r.status_code == 200, r.text
                titles = {t["title"] for t in r.json()["tasks"]}
                assert titles == {
                    "Tarea Liderazgo",
                    "Tarea Contexto y Apoyo",
                    "Tarea Operación y Mejora",
                }

                r = await client.get(f"/processes/{process.id}/plan-generation/status")
                assert r.status_code == 200
                assert r.json()["status"] == "completed"
        finally:
            app.dependency_overrides.clear()
