"""Route tests for task-comment endpoints (kanban).

Contract:
- GET  /processes/{id}/plan/tasks/{task_id}/comments → 200 list
- POST /processes/{id}/plan/tasks/{task_id}/comments → 201 created comment
- 404 when the caller does not own the process
- 404 when the task is unknown under the process's plan (repo returns None)
"""

import uuid
from contextlib import contextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


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
    with patch("src.config.settings.get_settings", return_value=mock_settings):
        from src.main import app
        from src.routes.user.auth import get_current_user as real_get_current_user

        app.dependency_overrides[real_get_current_user] = lambda: mock_current_user

        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def noop_lifespan(app):
            yield

        app.router.lifespan_context = noop_lifespan

        with TestClient(app) as c:
            yield c

        app.dependency_overrides.clear()


def _owned_process(owner_sub: str):
    from src.domain.entities.process import IsoStandard, Process, ProcessStatus

    return Process(
        id=uuid.uuid4(),
        consultant_id=uuid.UUID(owner_sub),
        company_id=uuid.uuid4(),
        iso_standard=IsoStandard.ISO_9001,
        status=ProcessStatus.PLAN_READY,
    )


def _comment(**overrides):
    from src.domain.entities.plan import TaskComment

    defaults = dict(
        id=uuid.uuid4(),
        task_id=uuid.uuid4(),
        author_id=uuid.uuid4(),
        body="Comentario de prueba",
    )
    defaults.update(overrides)
    return TaskComment(**defaults)


@contextmanager
def _override_repo(mock_repo):
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


def _repo(process, *, comments=None, added_comment=None):
    repo = MagicMock()
    repo.get_process = AsyncMock(return_value=process)
    repo.list_task_comments = AsyncMock(return_value=comments)
    repo.add_task_comment = AsyncMock(return_value=added_comment)
    return repo


class TestTaskCommentsRoutes:
    def test_list_comments_returns_200(self, client, mock_current_user):
        process = _owned_process(mock_current_user["sub"])
        task_id = uuid.uuid4()
        comment = _comment(task_id=task_id)
        mock_repo = _repo(process, comments=[comment])

        with _override_repo(mock_repo):
            r = client.get(f"/processes/{process.id}/plan/tasks/{task_id}/comments")

        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        body = r.json()
        assert len(body) == 1
        assert body[0]["body"] == "Comentario de prueba"
        mock_repo.list_task_comments.assert_awaited_once_with(process.id, task_id)

    def test_add_comment_returns_201(self, client, mock_current_user):
        process = _owned_process(mock_current_user["sub"])
        task_id = uuid.uuid4()
        comment = _comment(task_id=task_id, author_id=uuid.UUID(mock_current_user["sub"]))
        mock_repo = _repo(process, added_comment=comment)

        with _override_repo(mock_repo):
            r = client.post(
                f"/processes/{process.id}/plan/tasks/{task_id}/comments",
                json={"body": "Comentario de prueba"},
            )

        assert r.status_code == 201, f"got {r.status_code}: {r.text[:300]}"
        body = r.json()
        assert body["body"] == "Comentario de prueba"
        assert body["author_id"] == mock_current_user["sub"]
        mock_repo.add_task_comment.assert_awaited_once_with(
            process.id, task_id, uuid.UUID(mock_current_user["sub"]), "Comentario de prueba"
        )

    def test_list_comments_unknown_task_returns_404(self, client, mock_current_user):
        process = _owned_process(mock_current_user["sub"])
        mock_repo = _repo(process, comments=None)

        with _override_repo(mock_repo):
            r = client.get(f"/processes/{process.id}/plan/tasks/{uuid.uuid4()}/comments")

        assert r.status_code == 404
        assert r.json()["detail"] == "Tarea no encontrada"

    def test_add_comment_unknown_task_returns_404(self, client, mock_current_user):
        process = _owned_process(mock_current_user["sub"])
        mock_repo = _repo(process, added_comment=None)

        with _override_repo(mock_repo):
            r = client.post(
                f"/processes/{process.id}/plan/tasks/{uuid.uuid4()}/comments",
                json={"body": "x"},
            )

        assert r.status_code == 404
        assert r.json()["detail"] == "Tarea no encontrada"

    def test_foreign_process_returns_404(self, client, mock_current_user):
        from src.main import app
        from src.routes.user.auth import get_current_user as target

        attacker = {"sub": str(uuid.uuid4()), "email": "a@example.com", "cognito:groups": []}
        process = _owned_process(mock_current_user["sub"])
        mock_repo = _repo(process, comments=[])

        old_auth = app.dependency_overrides.get(target)
        app.dependency_overrides[target] = lambda: attacker
        try:
            with _override_repo(mock_repo):
                r = client.get(f"/processes/{process.id}/plan/tasks/{uuid.uuid4()}/comments")
        finally:
            if old_auth is not None:
                app.dependency_overrides[target] = old_auth
            else:
                app.dependency_overrides.pop(target, None)

        assert r.status_code == 404
        mock_repo.list_task_comments.assert_not_awaited()
