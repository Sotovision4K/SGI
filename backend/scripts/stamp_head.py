"""Stamp the baseline migration on an already-running (brownfield) DB.

Run this once after deploying the alembic setup to a live environment so that
alembic's version table matches reality (all tables already exist).

    python -m backend.scripts.stamp_head

It does NOT run upgrade() — it just writes "001_initial" into
alembic_version so the next `alembic upgrade head` starts clean.

"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from alembic import context
from alembic.config import Config
from alembic.script import Script
from alembic.runtime.migration import MigrationContext
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from src.config.settings import get_settings


async def stamp_head() -> None:
    cfg = Config()
    cfg.set_main_option("script_location", "alembic")
    cfg.set_main_option("prepend_sys_path", ".")

    settings = get_settings()
    configuration = {
        "sqlalchemy.url": settings.database_url,
    }

    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args={"statement_cache_size": 0},
    )

    script = Script.from_config(cfg, cfg.get_main_option("script_location"))
    revisions = script.get_revisions()
    head = revisions[-1].revision if revisions else None

    if head is None:
        print("ERROR: No migration heads found. Did you run alembic revision first?")
        return

    async with connectable.connect() as connection:
        context_ = MigrationContext.configure(connection)
        current = context_.get_current_revision()

        if current == head:
            print(f"Already stamped at {head} — nothing to do.")
            return

        if current is not None:
            print(f"Current alembic version: {current}")
            print(f"Will stamp head: {head}")
        else:
            print(f"No alembic version recorded — will stamp head: {head}")

        context_.stamp(script, head)
        print(f"Stamped at: {head}")

    await connectable.dispose()


if __name__ == "__main__":
    asyncio.run(stamp_head())
