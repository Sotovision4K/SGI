"""Phase 1.1 — Test the Mangum Lambda handler wrapper.

Tests:
- handler returns a valid API Gateway V1 REST response for the health endpoint
- handler returns a valid API Gateway V1 REST response for a 404
- handler works when environment variables are set
"""
import json
import os
from unittest.mock import AsyncMock, MagicMock, patch


def _make_api_gw_event(http_method: str, path: str, body: str | None = None) -> dict:
    """Build a minimal API Gateway V1 REST event that Mangum can parse."""
    return {
        "resource": "/{proxy+}",
        "path": path,
        "httpMethod": http_method,
        "headers": {
            "x-forwarded-proto": "https",
        },
        "multiValueHeaders": {},
        "queryStringParameters": None,
        "multiValueQueryStringParameters": None,
        "pathParameters": None,
        "stageVariables": None,
        "requestContext": {
            "resourceId": "test",
            "resourcePath": "/{proxy+}",
            "httpMethod": http_method,
            "requestId": "test-request-id",
            "identity": {
                "sourceIp": "127.0.0.1",
            },
            "stage": "v1",
        },
        "body": body,
        "isBase64Encoded": False,
    }


def _ensure_env_vars():
    """Set required env vars so Settings doesn't crash on import."""
    os.environ.setdefault("AWS_COGNITO_USER_POOL_ID", "test-pool-id")
    os.environ.setdefault("AWS_COGNITO_CLIENT_ID", "test-client-id")
    os.environ.setdefault("AWS_COGNITO_REGION", "us-east-1")
    os.environ.setdefault("AWS_COGNITO_JWKS_URL", "https://test/jwks.json")
    os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
    os.environ.setdefault("CORS_ALLOW_ORIGINS", "http://localhost:5173")


def _get_handler():
    """Import and return the Mangum handler with mocked DB engine."""
    _ensure_env_vars()

    # Build a mock engine so lifespan doesn't try to connect to a real DB
    mock_conn = AsyncMock()
    mock_conn.run_sync = AsyncMock()

    mock_engine_ctx = MagicMock()
    mock_engine_ctx.__aenter__.return_value = mock_conn
    mock_engine = MagicMock()
    mock_engine.begin.return_value = mock_engine_ctx

    # Patch get_engine and SQLModel BEFORE importing handler
    # We patch at the module level using the full import path
    with patch("src.adapters.db.user_repository.get_engine", return_value=mock_engine):
        with patch("sqlmodel.SQLModel"):
            # Clear any cached imports
            import sys
            for mod in list(sys.modules.keys()):
                if mod.startswith("handler") or mod == "src.main":
                    del sys.modules[mod]

            from handler import handler
            return handler


def test_handler_health_endpoint():
    """Asserts: handler returns 200 for GET /health."""
    handler = _get_handler()

    event = _make_api_gw_event("GET", "/health")
    context = {}  # type: ignore

    result = handler(event, context)

    assert "statusCode" in result
    assert isinstance(result["statusCode"], int)
    assert result["statusCode"] == 200

    body = json.loads(result["body"])
    assert body["status"] == "healthy"
    assert "timestamp" in body


def test_handler_returns_404_for_unknown_path():
    """Asserts: handler returns 404 for a path with no route."""
    handler = _get_handler()

    event = _make_api_gw_event("GET", "/nonexistent/route")
    context = {}  # type: ignore

    result = handler(event, context)

    assert result["statusCode"] == 404


def test_handler_handles_environment_variables():
    """Asserts: handler works when expected env vars are set."""
    handler = _get_handler()

    event = _make_api_gw_event("GET", "/health")
    context = {}  # type: ignore

    result = handler(event, context)
    assert "statusCode" in result
    assert result["statusCode"] == 200
