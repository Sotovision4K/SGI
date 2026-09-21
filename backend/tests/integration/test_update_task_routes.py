"""Route tests for PUT /processes/{id}/plan/tasks/{task_id} (Phase 6, editable tasks).

Mirrors the dependency-override pattern of test_routes.py: settings patched
before app import, get_current_user overridden, repo swapped via
app.dependency_overrides.

Contract:
- 200 with the updated task fields on success
- 400 when the body is empty (no body / {}) — nothing to update
- 404 when the task id is unknown (or belongs to another process's plan)
- 409 while a generation job is queued/running
- 404 when the caller does not own the process
"""

import uuid
from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ---- Fixtures --------------------------------------------------------------


@pytest.fixture
def mock_settings():
    s = MagicMock()
    s.anthropic_api_key = "sk-test"
    s.anthropic_model = "claude-test"
    s.database_url = "postgresql+asyncpg://test:test@localhost/test"
    s.aws_cognito_jwks_url = "https://cognito-idp.us-east-1.amazonaws.com/pool/.well-known/jwks.json"
    s.aws_cognito_client_id = "test-client"
    s.aws_cognito_region = "us-east-1"
    s.aws_cognito_user_pool_id = "us-east-1_TEST"
    return s


@pytest.fixture
def mock_current_user():
    return {"sub": str(uuid.uuid4()), "email": "test@example.com", "cognito:groups": []}


@pytest.fixture
def client(mock_settings, mock_current_user):
    """FastAPI test client with mocked settings + auth."""

    # Patch settings BEFORE app is imported
    with patch("src.config.settings.get_settings", return_value=mock_settings):
        from src.main import app
        from src.routes.user.auth import get_current_user as real_get_current_user

        # Override the get_current_user dependency to skip token verification
        app.dependency_overrides[real_get_current_user] = lambda: mock_current_user

        # Skip lifespan (DB connection)
        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def noop_lifespan(app):
            yield

        app.router.lifespan_context = noop_lifespan

        with TestClient(app) as c:
            yield c

        app.dependency_overrides.clear()


# ---- Helpers ----------------------------------------------------------------


def _owned_process(owner_sub: str):
    from src.domain.entities.process import IsoStandard, Process, ProcessStatus

    return Process(
        id=uuid.uuid4(),
        consultant_id=uuid.UUID(owner_sub),
        company_id=uuid.uuid4(),
        iso_standard=IsoStandard.ISO_9001,
        status=ProcessStatus.IN_PROGRESS,
    )


def _task(**overrides):
    from src.domain.entities.plan import Task, TaskPriority

    defaults = dict(
        id=uuid.uuid4(),
        plan_id=uuid.uuid4(),
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
    defaults.update(overrides)
    return Task(**defaults)


@contextmanager
def _override_repo(mock_repo):
    """Swap the process repository via dependency_overrides (patch() on the
    module attribute is ineffective — Depends() captures the original function
    at import time)."""
    from src.main import app
    from src.routes.processes.routes import get_process_repository

    old = app.dependency_overrides.get(get_process_repository)
    app.dependency_overrides[get_process_repository] = lambda: mock_repo
    try:
        yield
    finally:
        if old is not None:
            app.dependency_overrides[get_process_repository] = old
        else:
            app.dependency_overrides.pop(get_process_repository, None)


def _repo(process, *, active_job=None, patched_task=None):
    repo = MagicMock()
    repo.get_process = AsyncMock(return_value=process)
    repo.get_active_job = AsyncMock(return_value=active_job)
    repo.patch_task = AsyncMock(return_value=patched_task)
    return repo


# ---- Tests -------------------------------------------------------------------


class TestUpdateTaskRoute:
    def test_update_task_returns_200_with_updated_fields(self, client, mock_current_user):
        from src.domain.entities.plan import TaskPriority

        process = _owned_process(mock_current_user["sub"])
        task = _task(
            title="Nuevo título",
            priority=TaskPriority.HIGH,
            estimated_effort="3 días",
        )
        mock_repo = _repo(process, patched_task=task)

        with _override_repo(mock_repo):
            r = client.put(
                f"/processes/{process.id}/plan/tasks/{task.id}",
                json={
                    "title": "Nuevo título",
                    "priority": "high",
                    "estimated_effort": "3 días",
                },
            )

        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        body = r.json()
        assert body["id"] == str(task.id)
        assert body["title"] == "Nuevo título"
        assert body["priority"] == "high"
        assert body["estimated_effort"] == "3 días"
        # Untouched fields pass through from the returned task.
        assert body["description"] == "Crear el documento."
        assert body["owner_role"] == "Gerente de Calidad"
        assert body["require_document"] is True
        assert body["document_title"] == "Política de Calidad"

        # The route must hand patch_task a plain-string priority (enum → .value).
        call = mock_repo.patch_task.call_args
        assert call.args[0] == process.id
        assert call.args[1] == task.id
        assert call.args[2] == {
            "title": "Nuevo título",
            "priority": "high",
            "estimated_effort": "3 días",
        }

    def test_update_task_with_empty_object_returns_400(self, client, mock_current_user):
        process = _owned_process(mock_current_user["sub"])
        mock_repo = _repo(process)

        with _override_repo(mock_repo):
            r = client.put(
                f"/processes/{process.id}/plan/tasks/{uuid.uuid4()}", json={}
            )

        assert r.status_code == 400, f"got {r.status_code}: {r.text[:300]}"
        assert r.json()["detail"] == "No hay campos para actualizar"
        mock_repo.patch_task.assert_not_called()

    def test_update_task_with_no_body_returns_400(self, client, mock_current_user):
        process = _owned_process(mock_current_user["sub"])
        mock_repo = _repo(process)

        with _override_repo(mock_repo):
            r = client.put(f"/processes/{process.id}/plan/tasks/{uuid.uuid4()}")

        assert r.status_code == 400, f"got {r.status_code}: {r.text[:300]}"
        assert r.json()["detail"] == "No hay campos para actualizar"
        mock_repo.patch_task.assert_not_called()

    def test_update_task_rejects_invalid_priority(self, client, mock_current_user):
        process = _owned_process(mock_current_user["sub"])
        mock_repo = _repo(process)

        with _override_repo(mock_repo):
            r = client.put(
                f"/processes/{process.id}/plan/tasks/{uuid.uuid4()}",
                json={"priority": "urgent"},
            )

        assert r.status_code == 422, f"got {r.status_code}: {r.text[:300]}"
        mock_repo.patch_task.assert_not_called()

    def test_update_task_with_unknown_task_id_returns_404(self, client, mock_current_user):
        process = _owned_process(mock_current_user["sub"])
        mock_repo = _repo(process, patched_task=None)

        with _override_repo(mock_repo):
            r = client.put(
                f"/processes/{process.id}/plan/tasks/{uuid.uuid4()}",
                json={"title": "x"},
            )

        assert r.status_code == 404, f"got {r.status_code}: {r.text[:300]}"
        assert r.json()["detail"] == "Tarea no encontrada"

    def test_update_task_returns_409_while_job_queued_or_running(
        self, client, mock_current_user
    ):
        from src.domain.entities.plan_job import PlanJob, PlanJobStatus

        process = _owned_process(mock_current_user["sub"])
        for status in (PlanJobStatus.QUEUED, PlanJobStatus.RUNNING):
            active = PlanJob(
                process_id=process.id,
                consultant_id=process.consultant_id,
                status=status,
            )
            mock_repo = _repo(process, active_job=active)

            with _override_repo(mock_repo):
                r = client.put(
                    f"/processes/{process.id}/plan/tasks/{uuid.uuid4()}",
                    json={"title": "x"},
                )

            assert r.status_code == 409, f"{status}: got {r.status_code}: {r.text[:200]}"
            assert (
                r.json()["detail"]
                == "No se puede editar el plan mientras se está generando"
            )
            mock_repo.patch_task.assert_not_called()

    def test_update_task_on_foreign_process_returns_404(
        self, client, mock_current_user
    ):
        from src.main import app
        from src.routes.user.auth import get_current_user as target

        attacker = {
            "sub": str(uuid.uuid4()),
            "email": "attacker@example.com",
            "cognito:groups": [],
        }
        # Process owned by the *other* (mock_current_user) identity.
        process = _owned_process(mock_current_user["sub"])
        mock_repo = _repo(process)

        old_auth = app.dependency_overrides.get(target)
        app.dependency_overrides[target] = lambda: attacker
        try:
            with _override_repo(mock_repo):
                r = client.put(
                    f"/processes/{process.id}/plan/tasks/{uuid.uuid4()}",
                    json={"title": "malicious"},
                )
        finally:
            if old_auth is not None:
                app.dependency_overrides[target] = old_auth
            else:
                app.dependency_overrides.pop(target, None)

        assert r.status_code == 404, f"got {r.status_code}: {r.text[:300]}"
        mock_repo.patch_task.assert_not_called()
