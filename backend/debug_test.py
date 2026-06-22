import sys
sys.path.insert(0, "src")
import uuid
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi.testclient import TestClient

mock_settings = MagicMock()
mock_settings.anthropic_api_key = "sk-test"
mock_settings.anthropic_model = "claude-test"
mock_settings.database_url = "postgresql+asyncpg://test:test@localhost/test"
mock_settings.aws_cognito_jwks_url = "https://cognito-idp.us-east-1.amazonaws.com/pool/.well-known/jwks.json"
mock_settings.aws_cognito_client_id = "test-client"
mock_settings.aws_cognito_region = "us-east-1"
mock_settings.aws_cognito_user_pool_id = "us-east-1_TEST"
mock_current_user = {"sub": str(uuid.uuid4()), "email": "test@example.com", "cognito:groups": []}

with patch("src.config.settings.get_settings", return_value=mock_settings):
    from src.main import app
    from src.routes.user.auth import get_current_user as real_get_current_user
    app.dependency_overrides[real_get_current_user] = lambda: mock_current_user

    from contextlib import asynccontextmanager
    @asynccontextmanager
    async def noop_lifespan(app):
        yield
    app.router.lifespan_context = noop_lifespan

    mock_repo = MagicMock()
    mock_repo.get_process = AsyncMock(return_value=None)

    with patch(
        "src.routes.processes.routes.get_process_repository",
        return_value=lambda: mock_repo,
    ):
        with TestClient(app) as c:
            r = c.post(f"/api/v1/processes/{uuid.uuid4()}/generate-plan")
            print(f"Status: {r.status_code}")
            print(f"Body: {r.text[:1000]}")
