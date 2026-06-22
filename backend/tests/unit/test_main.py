"""Phase 1.5 + 1.6 — Test main.py CORS configuration and lifespan.

Tests:
- CORS reads CORS_ALLOW_ORIGINS env var when set
- CORS falls back to localhost defaults when env var is not set
- lifespan calls SQLModel.metadata.create_all on startup
- lifespan pings DB on startup
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


class _FakeSyncConn:
    """Fake synchronous SQLAlchemy connection for testing run_sync lambdas."""

    def execute(self, *args, **kwargs):
        """No-op execute that returns a MagicMock result."""
        return MagicMock()


def test_lifespan_calls_create_all(monkeypatch):
    """Assert lifespan calls SQLModel.metadata.create_all on startup."""
    monkeypatch.setenv("AWS_COGNITO_USER_POOL_ID", "test")
    monkeypatch.setenv("AWS_COGNITO_CLIENT_ID", "test")
    monkeypatch.setenv("AWS_COGNITO_REGION", "us-east-1")
    monkeypatch.setenv("AWS_COGNITO_JWKS_URL", "https://test/jwks")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "http://localhost:5173")

    from src.config.settings import get_settings
    get_settings.cache_clear()

    import asyncio

    # Collect run_sync calls so we can inspect the lambdas
    run_sync_calls = []

    class TrackedAsyncConn:
        async def run_sync(self, fn):
            run_sync_calls.append(fn)
            fn(_FakeSyncConn())

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

    # We expect 2 run_sync calls: SELECT 1 then create_all
    assert len(run_sync_calls) == 2, (
        f"Expected 2 run_sync calls, got {len(run_sync_calls)}"
    )

    # Verify the second lambda contains a call to metadata.create_all
    import inspect
    source = inspect.getsource(run_sync_calls[1])
    assert "create_all" in source, (
        f"Second run_sync call should reference create_all. Source: {source}"
    )


def test_lifespan_pings_db(monkeypatch):
    """Assert lifespan still pings DB on startup (SELECT 1)."""
    monkeypatch.setenv("AWS_COGNITO_USER_POOL_ID", "test")
    monkeypatch.setenv("AWS_COGNITO_CLIENT_ID", "test")
    monkeypatch.setenv("AWS_COGNITO_REGION", "us-east-1")
    monkeypatch.setenv("AWS_COGNITO_JWKS_URL", "https://test/jwks")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "http://localhost:5173")

    from src.config.settings import get_settings
    get_settings.cache_clear()

    import asyncio

    # Collect run_sync calls
    run_sync_calls = []

    class TrackedAsyncConn:
        async def run_sync(self, fn):
            run_sync_calls.append(fn)
            fn(_FakeSyncConn())

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

    # Verify run_sync was called at least twice (SELECT 1 + create_all)
    assert len(run_sync_calls) >= 2, (
        f"Expected at least 2 run_sync calls (SELECT 1 + create_all), got {len(run_sync_calls)}"
    )
