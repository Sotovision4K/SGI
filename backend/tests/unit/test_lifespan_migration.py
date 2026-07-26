"""Tests for the idempotent ALTER TABLE migration in lifespan (Step 1).

Covers the `_ensure_company_contact_columns(conn)` helper:
- missing columns are added with parameterized information_schema checks
- existing columns are left untouched (idempotent)
- the literal "active" string is never used
- lifespan wraps the migration in try/except and logs on failure without
  crashing the app
"""

import asyncio
import logging
import sys
from unittest.mock import MagicMock, patch

import pytest


class _FakeConn:
    """Records execute() calls and answers information_schema lookups.
    """

    def __init__(self, present_cols: set[str] | None = None):
        self.present = set(present_cols or ())
        self.calls: list[tuple[str, dict | None]] = []

    async def execute(self, stmt, params=None):
        self.calls.append((str(stmt), params))
        result = MagicMock()
        if "information_schema" in str(stmt):
            col = params.get("col") if isinstance(params, dict) else None
            result.fetchone.return_value = (col,) if col in self.present else None
        return result


NEW_COLUMNS = [
    ("contact_name", "VARCHAR(100)"),
    ("contact_email", "VARCHAR(255)"),
    ("contact_phone", "VARCHAR(30)"),
]


@pytest.mark.asyncio
async def test_missing_columns_altered():
    from src.main import _ensure_company_contact_columns

    conn = _FakeConn(present_cols=set())
    await _ensure_company_contact_columns(conn)

    # 3 SELECT checks + 3 ALTERs
    selects = [c for c in conn.calls if "information_schema" in c[0]]
    alters = [c for c in conn.calls if "ALTER TABLE" in c[0]]
    assert len(selects) == 3
    assert len(alters) == 3

    # SELECT must be parameterized (uses :col, passes dict with the col name)
    for stmt, params in selects:
        assert params and "col" in params
        assert params["col"] in {c[0] for c in NEW_COLUMNS}

    # ALTER uses the exact defined types
    alter_texts = " ".join(s for s, _ in alters)
    for col_name, col_type in NEW_COLUMNS:
        assert f"ADD COLUMN {col_name} {col_type}" in alter_texts

    # The literal word "active" must never appear in any migration SQL.
    for stmt, _ in conn.calls:
        assert "active" not in stmt.lower()


@pytest.mark.asyncio
async def test_existing_columns_not_altered():
    from src.main import _ensure_company_contact_columns

    conn = _FakeConn(present_cols={"contact_name", "contact_email", "contact_phone"})
    await _ensure_company_contact_columns(conn)

    selects = [c for c in conn.calls if "information_schema" in c[0]]
    alters = [c for c in conn.calls if "ALTER TABLE" in c[0]]
    assert len(selects) == 3
    assert alters == []  # everything present → no ALTER


@pytest.mark.asyncio
async def test_partial_existing_only_missing_altered():
    from src.main import _ensure_company_contact_columns

    conn = _FakeConn(present_cols={"contact_email"})
    await _ensure_company_contact_columns(conn)

    alters = [c for c in conn.calls if "ALTER TABLE" in c[0]]
    alter_texts = " ".join(s for s, _ in alters)
    assert "ADD COLUMN contact_name VARCHAR(100)" in alter_texts
    assert "ADD COLUMN contact_phone VARCHAR(30)" in alter_texts
    assert "contact_email" not in alter_texts  # already present


# --------------------------------------------------------------------------- #
# Lifespan integration: migration failure must not crash the app
# --------------------------------------------------------------------------- #


@pytest.fixture
def _clear_src_main_cache():
    to_clear = [k for k in sys.modules if k == "src.main" or k.startswith("src.main.")]
    for m in to_clear:
        del sys.modules[m]
    try:
        from src.config.settings import get_settings
        get_settings.cache_clear()
    except ImportError:
        pass
    yield
    to_clear = [k for k in sys.modules if k == "src.main" or k.startswith("src.main.")]
    for m in to_clear:
        del sys.modules[m]
    try:
        from src.config.settings import get_settings
        get_settings.cache_clear()
    except ImportError:
        pass


def _engine_with(begin_conns):
    """Engine whose begin() yields successive fake connections.

    begin_conns: ordered list returned one per engine.begin() call.
    """
    it = iter(begin_conns)

    class _CM:
        def __init__(self, conn):
            self._conn = conn

        async def __aenter__(self):
            return self._conn

        async def __aexit__(self, *exc):
            return False

    engine = MagicMock()
    engine.begin.side_effect = lambda: _CM(next(it))
    return engine


def _valid_env(monkeypatch):
    monkeypatch.setenv("AWS_COGNITO_USER_POOL_ID", "test-pool-id")
    monkeypatch.setenv("AWS_COGNITO_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("AWS_COGNITO_REGION", "us-east-1")
    monkeypatch.setenv("AWS_COGNITO_JWKS_URL", "https://test/jwks.json")
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "http://localhost:5173")


class _OkConn:
    """Conn whose run_sync no-ops and execute succeeds (columns present)."""

    async def run_sync(self, fn):
        pass

    async def execute(self, stmt, params=None):
        result = MagicMock()
        result.fetchone.return_value = ("present",)
        return result

    async def close(self):
        pass


class _FailingMigrationConn:
    """run_sync no-ops; migration execute raises."""

    async def run_sync(self, fn):
        pass

    async def execute(self, stmt, params=None):
        raise RuntimeError("migration boom")

    async def close(self):
        pass


def test_lifespan_migration_failure_logged_not_crashed(
    monkeypatch, caplog, _clear_src_main_cache
):
    """If the migration block raises, lifespan logs and still yields."""
    _valid_env(monkeypatch)
    caplog.set_level(logging.ERROR)

    # begin() order: SELECT 1, create_all (both run_sync, ok), migration (raises)
    engine = _engine_with([_OkConn(), _OkConn(), _FailingMigrationConn()])

    with patch("src.main.get_engine", return_value=engine):
        from src.main import lifespan, app

        async def _run():
            async with lifespan(app):
                pass

        asyncio.run(_run())

    error_messages = [r.message for r in caplog.records if r.levelno >= logging.ERROR]
    assert any(
        "migration" in m.lower() or "contact" in m.lower() for m in error_messages
    ), f"Expected migration failure logged, got: {error_messages}"


def test_lifespan_migration_success_logged(
    monkeypatch, caplog, _clear_src_main_cache
):
    """A successful migration emits an info log."""
    _valid_env(monkeypatch)
    caplog.set_level(logging.INFO)

    engine = _engine_with([_OkConn(), _OkConn(), _OkConn()])

    with patch("src.main.get_engine", return_value=engine):
        from src.main import lifespan, app

        async def _run():
            async with lifespan(app):
                pass

        asyncio.run(_run())

    info_messages = [r.message for r in caplog.records if r.levelno >= logging.INFO]
    assert any(
        "contact" in m.lower() or "migration" in m.lower() for m in info_messages
    ), f"Expected contact/migration info log, got: {info_messages}"