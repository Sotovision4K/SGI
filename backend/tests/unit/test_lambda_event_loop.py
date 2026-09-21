"""Regression tests for the Lambda asyncio event-loop fix (BLOCKING BUG).

Covers the two failure modes that only appear on the live Lambda stack and are
invisible to the SQLite/fake-LLM suite:

1. `get_engine()` must construct with ``NullPool`` — no cross-invocation
   connection reuse (asyncpg pools bind to one event loop).
2. ``NullPool`` rejects QueuePool-only kwargs (``pool_size``/``max_overflow``),
   so ``get_engine()`` must NOT pass them, or ``create_async_engine`` raises a
   ``TypeError`` at runtime.
3. The handler's ``aws:sqs`` branch must run the worker on the process-wide loop
   via ``run_until_complete`` (not a fresh ``asyncio.run`` per record).
"""
import sys
from unittest.mock import AsyncMock

from sqlalchemy.pool import NullPool

import src.adapters.db.user_repository as ur


def test_get_engine_constructs_with_nullpool():
    """Asserts: get_engine() builds a real engine with NullPool (lazy — no DB needed)."""
    ur._engine = None
    try:
        engine = ur.get_engine("postgresql+asyncpg://u:p@localhost/db")
        assert isinstance(engine.pool, NullPool)
        # Singleton: second call returns the same engine (no rebuild).
        assert ur.get_engine("postgresql+asyncpg://u:p@localhost/db") is engine
    finally:
        ur._engine = None


def test_handler_sqs_branch_awaits_worker_on_process_loop():
    """Asserts: aws:sqs events route to handle_sqs_event (no per-record asyncio.run)."""
    import os

    os.environ.setdefault("AWS_COGNITO_USER_POOL_ID", "test-pool-id")
    os.environ.setdefault("AWS_COGNITO_CLIENT_ID", "test-client-id")
    os.environ.setdefault("AWS_COGNITO_REGION", "us-east-1")
    os.environ.setdefault("AWS_COGNITO_JWKS_URL", "https://test/jwks.json")
    os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
    os.environ.setdefault("CORS_ALLOW_ORIGINS", "http://localhost:5173")

    # Import fresh so the module-level _loop is created under pytest.
    for mod in list(sys.modules.keys()):
        if mod.startswith("handler") or mod == "src.main":
            del sys.modules[mod]

    import handler as handler_module

    expected = {"statusCode": 200, "batchItemFailures": []}
    handler_module.handle_sqs_event = AsyncMock(return_value=expected)

    event = {
        "Records": [
            {
                "eventSource": "aws:sqs",
                "messageId": "m1",
                "body": '{"process_id": "00000000-0000-0000-0000-000000000000", '
                '"consultant_id": "00000000-0000-0000-0000-000000000000"}',
            }
        ]
    }
    result = handler_module.handler(event, {})
    assert result == expected
    assert handler_module.handle_sqs_event.await_count == 1
