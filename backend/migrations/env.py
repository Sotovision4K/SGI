import asyncio
import os
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine
from sqlmodel import SQLModel

from alembic import context

# Import all SQLModel table modules so their tables register on SQLModel.metadata
# before autogenerate compares models to the database.
from src.adapters.db import user_repository as _user_repo  # noqa: F401
from src.adapters.db import process_repository as _process_repo  # noqa: F401

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = SQLModel.metadata


def _resolve_url() -> str:
    """Resolve the database URL, preferring the DATABASE_URL env var.

    Alembic reads its URL from the env var (the same one the app uses), so the
    connection string is never committed to the repo. Falls back to the
    `sqlalchemy.url` option in alembic.ini for local/offline workflows.
    """
    url = os.getenv("DATABASE_URL")
    if url:
        return url
    return config.get_main_option("sqlalchemy.url") or ""


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    Emits SQL to stdout without connecting to the DB. Useful for review.
    """
    url = _resolve_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and run migrations within a connection."""
    url = _resolve_url()
    connectable = create_async_engine(
        url,
        poolclass=pool.NullPool,
        # Required for Supabase / PgBouncer transaction-mode pooling: prepared
        # statements can't be shared across pooled connections. Matches the
        # app's own engine config in user_repository.get_engine().
        connect_args={"statement_cache_size": 0, "timeout": 15},
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()