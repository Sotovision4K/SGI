"""Phase 1.5 + 1.6 — Test main.py CORS configuration and lifespan.

Tests:
- CORS reads CORS_ALLOW_ORIGINS env var when set
- CORS falls back to localhost defaults when env var is not set
- lifespan pings DB on startup (SELECT 1; schema bootstrap moved to Alembic)
"""
from unittest.mock import MagicMock, patch


# ═══════════════════════════════════════════════════════════════════
# Phase 1.5 — CORS
# ═══════════════════════════════════════════════════════════════════


def test_parse_cors_origins_with_env_var():
    """_parse_cors_origins splits comma-separated env var."""
    from src.main import _parse_cors_origins

    result = _parse_cors_origins("https://abc.cloudfront.net,https://xyz.cloudfront.net")
    assert "https://abc.cloudfront.net" in result
    assert "https://xyz.cloudfront.net" in result
    assert len(result) == 2


def test_parse_cors_origins_falls_back_to_localhost():
    """_parse_cors_origins returns localhost defaults when empty/None."""
    from src.main import _parse_cors_origins

    for val in ("", None):
        result = _parse_cors_origins(val)
        assert "http://localhost:5173" in result
        assert "http://localhost:3000" in result


def test_parse_cors_origins_handles_single_origin():
    """_parse_cors_origins handles a single origin."""
    from src.main import _parse_cors_origins

    result = _parse_cors_origins("https://example.com")
    assert result == ["https://example.com"]


def test_parse_cors_origins_strips_whitespace():
    """_parse_cors_origins strips whitespace around origins."""
    from src.main import _parse_cors_origins

    result = _parse_cors_origins("  https://a.com  ,  https://b.com  ")
    assert result == ["https://a.com", "https://b.com"]


# ═══════════════════════════════════════════════════════════════════
# Phase 1.6 — Lifespan
# ═══════════════════════════════════════════════════════════════════


def test_lifespan_pings_db(monkeypatch):
    """Assert lifespan runs SELECT 1 against the DB on startup.

    Schema bootstrap (create_all / ALTER TABLE) moved to Alembic;
    lifespan only confirms DB reachability so /health is never a 502.
    """
    monkeypatch.setenv("AWS_COGNITO_USER_POOL_ID", "test")
    monkeypatch.setenv("AWS_COGNITO_CLIENT_ID", "test")
    monkeypatch.setenv("AWS_COGNITO_REGION", "us-east-1")
    monkeypatch.setenv("AWS_COGNITO_JWKS_URL", "https://test/jwks")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "http://localhost:5173")

    from src.config.settings import get_settings
    get_settings.cache_clear()

    import asyncio

    execute_calls: list = []

    class TrackedAsyncConn:
        async def execute(self, stmt, *args, **kwargs):
            execute_calls.append(stmt)
            result = MagicMock()
            result.fetchone.return_value = (1,)
            return result

    mock_conn = TrackedAsyncConn()
    mock_engine_ctx = MagicMock()
    mock_engine_ctx.__aenter__.return_value = mock_conn
    mock_engine = MagicMock()
    mock_engine.begin.return_value = mock_engine_ctx

    with patch("src.main.get_engine", return_value=mock_engine):
        from src.main import lifespan, app

        async def run():
            async with lifespan(app):
                pass

        asyncio.run(run())

    # Lifespan issues exactly 1 execute call: the SELECT 1 ping
    assert len(execute_calls) == 1, (
        f"Expected 1 execute call (SELECT 1), got {len(execute_calls)}"
    )

    # Verify the statement contains SELECT 1
    assert "SELECT 1" in str(execute_calls[0]), (
        f"execute call should use SELECT 1. Got: {execute_calls[0]}"
    )
