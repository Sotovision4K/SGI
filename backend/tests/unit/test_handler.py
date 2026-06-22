"""Phase 1.1 — Test the Mangum Lambda handler wrapper.

Tests:
- handler returns a valid API Gateway V1 REST response for the health endpoint
- handler returns a valid API Gateway V1 REST response for a 404
- handler works when environment variables are set
"""
import json
import os
import sys
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


# Mock the DB engine before importing handler so lifespan doesn't crash
def _setup_mocks():
    """Mock get_engine to return a fake async engine that succeeds."""
    mock_conn = AsyncMock()
    mock_conn.run_sync = AsyncMock()

    mock_engine_ctx = MagicMock()
    mock_engine_ctx.__aenter__.return_value = mock_conn
    mock_engine = MagicMock()
    mock_engine.begin.return_value = mock_engine_ctx

    patch("src.main.get_engine", return_value=mock_engine).start()
    patch("src.main.SQLModel").start()


# Only set up mocks once
_setup_mocks()


def test_handler_health_endpoint():
    """Asserts: handler returns 200 for GET /health."""
    from handler import handler

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
    from handler import handler

    event = _make_api_gw_event("GET", "/nonexistent/route")
    context = {}  # type: ignore

    result = handler(event, context)

    assert result["statusCode"] == 404


def test_handler_handles_environment_variables():
    """Asserts: handler works when expected env vars are set."""
    from handler import handler

    os.environ.setdefault("AWS_COGNITO_USER_POOL_ID", "test-pool-id")
    os.environ.setdefault("AWS_COGNITO_CLIENT_ID", "test-client-id")
    os.environ.setdefault("AWS_COGNITO_REGION", "us-east-1")
    os.environ.setdefault("AWS_COGNITO_JWKS_URL", "https://test/jwks.json")
    os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")

    event = _make_api_gw_event("GET", "/health")
    context = {}  # type: ignore

    result = handler(event, context)
    assert "statusCode" in result
    assert result["statusCode"] == 200
