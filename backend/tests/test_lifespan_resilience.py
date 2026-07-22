"""Tests for lifespan resilience — missing env vars and unreachable DB.

Covers:
1. Health endpoint returns 200 when DB is available (happy path)
2. Health endpoint returns 200 when env vars are MISSING
3. Health endpoint returns 200 when DB is UNREACHABLE
4. DB-dependent endpoint fails gracefully when DB is down
5. Lifespan initializes DB successfully (SELECT 1 + run_migrations + logging)
"""

import asyncio
import inspect
import logging
import sys
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _clear_src_main_cache():
    """Remove src.main from sys.modules so each test gets a fresh import.

    Without this, a prior test may cache src.main with stale references
    (e.g. the real get_settings) and patches against the settings module
    won't take effect inside the already-imported main module.
    """
    to_clear = [k for k in sys.modules if k == "src.main" or k.startswith("src.main.")]
    for mod in to_clear:
        del sys.modules[mod]

    # Also clear the settings LRU cache — get_settings uses @lru_cache.
    try:
        from src.config.settings import get_settings
        get_settings.cache_clear()
    except ImportError:
        pass

    yield

    # Clean up afterwards as well (for test isolation)
    to_clear = [k for k in sys.modules if k == "src.main" or k.startswith("src.main.")]
    for mod in to_clear:
        del sys.modules[mod]

    try:
        from src.config.settings import get_settings
        get_settings.cache_clear()
    except ImportError:
        pass


@pytest.fixture
def valid_env(monkeypatch):
    """Set all environment variables required by Settings."""
    monkeypatch.setenv("AWS_COGNITO_USER_POOL_ID", "test-pool-id")
    monkeypatch.setenv("AWS_COGNITO_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("AWS_COGNITO_REGION", "us-east-1")
    monkeypatch.setenv("AWS_COGNITO_JWKS_URL", "https://test/jwks.json")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "http://localhost:5173")


# ---------------------------------------------------------------------------
# Helper: mock engines
# ---------------------------------------------------------------------------


def _mock_engine_that_works():
    """Create a mock async engine whose begin() context manager succeeds.

    Uses AsyncMock for the context manager so that both __aenter__ and
    __aexit__ return proper awaitables.  MagicMock.__aexit__ is NOT
    awaitable by default and will hang or raise TypeError inside an
    ``async with`` block.
    """
    mock_conn = AsyncMock()
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__.return_value = mock_conn
    mock_engine = MagicMock()
    mock_engine.begin.return_value = mock_ctx
    return mock_engine


def _mock_engine_that_raises():
    """Create a mock async engine whose begin() context manager raises.

    When lifespan calls ``async with engine.begin() as conn:`` the
    ``__aenter__`` side-effect fires and the except block catches it.
    Because __aenter__ raises before entering the body, __aexit__ is
    never called by the async-with protocol — a MagicMock is safe here.
    """
    mock_ctx = MagicMock()
    mock_ctx.__aenter__.side_effect = ConnectionRefusedError("Connection refused")
    mock_engine = MagicMock()
    mock_engine.begin.return_value = mock_ctx
    return mock_engine


# ---------------------------------------------------------------------------
# Test 1 — Happy path: /health when DB is available
# ---------------------------------------------------------------------------


def test_health_returns_200_when_db_available(valid_env):
    """Assert /health returns 200 with healthy status when DB is reachable."""

    mock_engine = _mock_engine_that_works()

    # Patch get_engine at the point where lifespan calls it.  The lifespan
    # function lives in src.main, so patching src.main.get_engine intercepts
    # the call regardless of whether the module was freshly imported or cached.
    with patch("src.main.get_engine", return_value=mock_engine), \
         patch("src.main.run_migrations", new=AsyncMock()):
        from src.main import app
        with TestClient(app) as client:
            response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert "timestamp" in body


# ---------------------------------------------------------------------------
# Test 2 — Missing env vars (Settings validation fails)
# ---------------------------------------------------------------------------


def test_health_returns_200_when_env_vars_missing(caplog):
    """Assert the app still starts and /health returns 200 when env vars are missing.

    The lifespan catches ``pydantic.ValidationError`` from ``get_settings()``,
    logs the error, and yields without crashing.

    Note: we patch ``src.main.get_settings`` *after* importing the module
    but *before* creating ``TestClient``.  The lifespan function resolves
    ``get_settings`` from ``src.main``'s module globals at call time, so
    patching the module namespace is sufficient.  We cannot rely on deleting
    env vars alone because pydantic-settings reads from ``.env`` as fallback.
    """
    caplog.set_level(logging.ERROR)

    # Fresh import ensured by _clear_src_main_cache fixture
    import src.main
    from src.main import app

    # Replace get_settings in the module namespace AFTER import.
    # lifespan resolves get_settings at call time from module globals.
    with patch.object(
        src.main,
        "get_settings",
        side_effect=ValidationError.from_exception_data(
            title="Settings validation failed",
            line_errors=[],
        ),
    ):
        with TestClient(app) as client:
            response = client.get("/health")

    # App must NOT crash — health is served
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"

    # Lifespan must log the validation error
    error_messages = [r.message for r in caplog.records if r.levelno >= logging.ERROR]
    assert any(
        "Settings validation failed" in msg for msg in error_messages
    ), f"Expected 'Settings validation failed' in error logs, got: {error_messages}"


# ---------------------------------------------------------------------------
# Test 3 — Unreachable DB
# ---------------------------------------------------------------------------


def test_health_returns_200_when_db_unreachable(valid_env, caplog):
    """Assert /health returns 200 even when the database is unreachable.

    The lifespan catches any exception during DB init, logs it, and yields
    without crashing — keeping the app alive for health checks.
    """
    caplog.set_level(logging.ERROR)
    mock_engine = _mock_engine_that_raises()

    with patch("src.main.get_engine", return_value=mock_engine):
        from src.main import app
        with TestClient(app) as client:
            response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"

    # Lifespan must log the DB failure
    error_messages = [r.message for r in caplog.records if r.levelno >= logging.ERROR]
    assert any(
        "Database initialization failed" in msg for msg in error_messages
    ), f"Expected 'Database initialization failed' in error logs, got: {error_messages}"


# ---------------------------------------------------------------------------
# Test 3b — /health when run_migrations raises
# ---------------------------------------------------------------------------


def test_health_returns_200_when_migrations_fail(valid_env, caplog):
    """Assert /health returns 200 when run_migrations raises.

    The lifespan catches exceptions from run_migrations, logs the error,
    and yields without crashing — /health must still return 200.
    """
    caplog.set_level(logging.ERROR)
    mock_engine = _mock_engine_that_works()

    with patch("src.main.get_engine", return_value=mock_engine), \
         patch("src.main.run_migrations", new=AsyncMock(
             side_effect=RuntimeError("Migration failed")
         )):
        from src.main import app
        with TestClient(app) as client:
            response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"

    error_messages = [r.message for r in caplog.records if r.levelno >= logging.ERROR]
    assert any(
        "Database initialization failed" in msg for msg in error_messages
    ), f"Expected 'Database initialization failed' in error logs, got: {error_messages}"


# ---------------------------------------------------------------------------
# Test 4 — DB-dependent endpoint fails gracefully when DB is unreachable
# ---------------------------------------------------------------------------


def test_db_endpoint_fails_gracefully_when_db_unreachable(valid_env):
    """A DB-dependent endpoint returns 5xx when the database is unreachable.

    The lifespan catches the DB init failure via the mocked engine, and the
    app starts.  For the route-level DB dependency we override the repository
    to raise directly — simulating a real DB failure during request handling.

    The key assertion: the endpoint returns a 5xx error, NOT a crash,
    a socket hangup, or a misleading success response.
    """
    mock_engine = _mock_engine_that_raises()

    with patch("src.main.get_engine", return_value=mock_engine):
        from src.main import app
        from src.routes.user.auth import get_current_user as _real_get_current_user
        from src.routes.user.routes import get_user_repository

        # Bypass Cognito token verification so we can reach the route handler
        mock_user = {
            "sub": str(uuid.uuid4()),
            "email": "test@example.com",
            "cognito:groups": ["admin"],
        }
        app.dependency_overrides[_real_get_current_user] = lambda: mock_user

        # Simulate a DB failure at the repository level.
        # The lifespan already caught its own DB init error; this tests
        # what happens when a request-level DB call fails.
        async def _failing_repo():
            raise RuntimeError("Database connection failed at query time")

        app.dependency_overrides[get_user_repository] = _failing_repo

        # raise_server_exceptions=False is critical: without it, TestClient
        # re-raises any unhandled exception instead of returning a 500.
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.get("/users?skip=0&limit=1")

        app.dependency_overrides.clear()

    # The endpoint must return a server error (5xx), NOT succeed and NOT crash.
    assert response.status_code >= 500, (
        f"Expected 5xx when DB is unreachable, got {response.status_code}: "
        f"{response.text[:300]}"
    )


# ---------------------------------------------------------------------------
# Test 5 — Lifespan initializes DB successfully (unit-style verification)
# ---------------------------------------------------------------------------


def test_lifespan_initializes_db_successfully(valid_env, caplog):
    """Verify lifespan calls SELECT 1, runs migrations, and logs success.

    Uses the same pattern as the existing test_lifespan_runs_migrations
    in test_main.py: a tracked async connection records the lambdas passed
    to ``run_sync``, and we inspect their source code to confirm the
    correct operations are wired in.
    """
    caplog.set_level(logging.INFO)

    run_sync_calls: list = []

    class _TrackedConn:
        """Async connection fake that records run_sync calls WITHOUT executing
        the lambdas (to avoid needing a full SQLAlchemy connection mock)."""

        async def run_sync(self, fn):
            run_sync_calls.append(fn)
            # Intentionally do NOT call fn(...) — executing the lambdas on
            # a bare object would fail with _run_ddl_visitor missing.
            # We only need to verify the lambdas exist and contain the
            # right references.

        async def close(self):
            pass

    mock_conn = _TrackedConn()
    # Use AsyncMock so __aenter__/__aexit__ are properly awaitable
    mock_ctx = AsyncMock()
    mock_ctx.__aenter__.return_value = mock_conn
    mock_engine = MagicMock()
    mock_engine.begin.return_value = mock_ctx

    with patch("src.main.get_engine", return_value=mock_engine), \
         patch("src.main.run_migrations", new=AsyncMock()) as mock_migrations:
        from src.main import lifespan, app

        async def _run_lifespan():
            async with lifespan(app):
                pass

        asyncio.run(_run_lifespan())

    # --- Assertions ---

    # 1. engine.begin() must be called exactly once: SELECT 1 (migrations
    #    use their own engine inside run_migrations, which is mocked here)
    assert mock_engine.begin.call_count == 1, (
        f"Expected 1 call to engine.begin(), got {mock_engine.begin.call_count}"
    )

    # 2. A single run_sync lambda must have been registered (SELECT 1)
    assert len(run_sync_calls) == 1, (
        f"Expected 1 run_sync call, got {len(run_sync_calls)}"
    )

    # 3. The single lambda must reference SELECT 1
    source_first = inspect.getsource(run_sync_calls[0])
    assert "SELECT 1" in source_first, (
        f"run_sync should reference SELECT 1. Source: {source_first}"
    )

    # 4. run_migrations must be awaited once with the database URL
    mock_migrations.assert_awaited_once_with(
        "postgresql+asyncpg://test:test@localhost/test"
    )

    # 5. "Database initialized successfully" must be logged
    info_messages = [r.message for r in caplog.records if r.levelno >= logging.INFO]
    assert any(
        "Database initialized successfully" in msg for msg in info_messages
    ), f"Expected 'Database initialized successfully' in info logs, got: {info_messages}"
