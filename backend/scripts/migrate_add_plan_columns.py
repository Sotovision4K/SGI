"""One-time migration: add plan edit-metadata columns to the `plans` table.

Adds the two columns introduced by the Phase 6 editable-tasks feature to the
existing `plans` table in Supabase Postgres:

- ``updated_at``  TEXT NOT NULL DEFAULT ''
- ``revision``    INTEGER NOT NULL DEFAULT 0

These are persistence-only metadata (NOT on the `Plan` domain entity):
``updated_at`` is bumped on every hand-edit of a plan task, and ``revision``
counts hand-edits (0 = pristine LLM-generated plan, +1 per hand-edit).

This is a manual, one-off step run against the deployed database before the new
SQLModel ``PlanTable`` columns are read/written by the application. Alembic is
deferred per the deployment spec, so new columns are applied here via raw
``ALTER TABLE`` statements (mirroring the guidance in DEPLOY_PLAN.md).

Uses synchronous psycopg3 (not asyncio), reading ``DATABASE_URL`` from the
environment and stripping the SQLAlchemy asyncpg dialect prefix exactly as
``src/trigger/post_signup_trigger.py`` does.
"""

import logging
import os

import psycopg

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Columns to add, in declaration order. Identifiers are a hardcoded safe
# constant (no user input), so string-formatting them into the DDL is
# acceptable — SQL identifiers cannot be passed as query parameters.
COLUMNS: list[tuple[str, str]] = [
    ("updated_at", "TEXT NOT NULL DEFAULT ''"),
    ("revision", "INTEGER NOT NULL DEFAULT 0"),
]


def _database_url() -> str:
    database_url = os.environ.get("DATABASE_URL", "")
    # Strip SQLAlchemy dialect prefix for raw psycopg connection.
    # postgresql+asyncpg://... → postgresql://...
    if "+" in database_url and "://" in database_url:
        scheme, rest = database_url.split("://", 1)
        if "+" in scheme:
            database_url = scheme.split("+")[0] + "://" + rest
    return database_url


def main() -> None:
    database_url = _database_url()
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set")

    # `ADD COLUMN IF NOT EXISTS` has been supported since PostgreSQL 9.6, so
    # re-runs are naturally idempotent — no need for a try/except skip branch.
    # (A failed statement aborts the transaction in Postgres, so "skip and
    # continue" would be impossible to do safely anyway.)
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            for column, definition in COLUMNS:
                cur.execute(
                    f"ALTER TABLE plans ADD COLUMN IF NOT EXISTS {column} {definition}"
                )
                logger.info("Ensured column exists: %s", column)
        conn.commit()

    logger.info("Migration complete: %s", [c for c, _ in COLUMNS])
    print(f"Migration complete: ensured {[c for c, _ in COLUMNS]} exist on plans.")


if __name__ == "__main__":
    main()
