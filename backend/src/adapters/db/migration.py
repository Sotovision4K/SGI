import asyncio
import logging
from pathlib import Path

from alembic import command
from alembic.config import Config

logger = logging.getLogger(__name__)

# backend/src/adapters/db/migration.py -> parents[3] == backend/ (or /var/task on Lambda)
_ALEMBIC_INI = Path(__file__).resolve().parents[3] / "alembic.ini"


def _build_config(database_url: str) -> Config:
    cfg = Config(str(_ALEMBIC_INI))
    # env.py prefers DATABASE_URL env var, but we set the ini option too so the
    # connection is unambiguous regardless of how env.py resolves the URL.
    cfg.set_main_option("sqlalchemy.url", database_url)
    return cfg


async def run_migrations(database_url: str) -> None:
    """Apply pending Alembic migrations. Safe to call on every startup.

    Runs in a worker thread because Alembic's command API is synchronous and
    migrations/env.py creates its own asyncio loop via asyncio.run(). On a DB
    already at head this is a cheap no-op (a single version-table query).
    """
    def _upgrade() -> None:
        cfg = _build_config(database_url)
        command.upgrade(cfg, "head")

    await asyncio.to_thread(_upgrade)
    logger.info("Alembic migrations up to date")