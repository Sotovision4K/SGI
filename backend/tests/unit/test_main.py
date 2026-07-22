"""Phase 1.5 + 1.6 — Test main.py CORS configuration and lifespan.

Tests:
- CORS reads CORS_ALLOW_ORIGINS env var when set
- CORS falls back to localhost defaults when env var is not set
- lifespan calls SQLModel.metadata.create_all on startup
- lifespan pings DB on startup
"""
from unittest.mock import AsyncMock, MagicMock, patch


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


def test_lifespan_runs_migrations(monkeypatch):
    """Assert lifespan runs Alembic migrations on startup and pings DB."""
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

    with patch("src.main.get_engine", return_value=mock_engine), \
         patch("src.main.run_migrations", new=AsyncMock()) as mock_migrations:
        from src.main import lifespan, app

        async def run():
            async with lifespan(app):
                pass

        asyncio.run(run())

    # We expect a single run_sync call: SELECT 1 (migrations run via Alembic)
    assert len(run_sync_calls) == 1, (
        f"Expected 1 run_sync call, got {len(run_sync_calls)}"
    )

    # Verify the lambda contains a SELECT 1 ping
    import inspect
    source = inspect.getsource(run_sync_calls[0])
    assert "SELECT 1" in source, (
        f"run_sync call should reference SELECT 1. Source: {source}"
    )

    # Verify run_migrations was awaited once with the database URL
    mock_migrations.assert_awaited_once_with(
        "postgresql+asyncpg://test:test@localhost/test"
    )


def test_lifespan_pings_db(monkeypatch):
    """Assert lifespan still pings DB on startup (SELECT 1).

    run_migrations is mocked so real Alembic does not fire in tests.
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

    with patch("src.main.get_engine", return_value=mock_engine), \
         patch("src.main.run_migrations", new=AsyncMock()):
        from src.main import lifespan, app

        async def run():
            async with lifespan(app):
                pass

        asyncio.run(run())

    # Verify run_sync was called at least once (SELECT 1)
    assert len(run_sync_calls) >= 1, (
        f"Expected at least 1 run_sync call (SELECT 1), got {len(run_sync_calls)}"
    )

    # Verify the first lambda contains a SELECT 1 ping
    import inspect
    source = inspect.getsource(run_sync_calls[0])
    assert "SELECT 1" in source, (
        f"run_sync call should reference SELECT 1. Source: {source}"
    )
