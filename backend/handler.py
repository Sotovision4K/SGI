"""Lambda entrypoint for the FastAPI / Mangum application.

Branches on event shape:
- `aws:sqs` events (from the plan-generation queue's event source mapping)
  route to the async worker (`handle_sqs_event`).
- Everything else routes through Mangum to FastAPI (HTTP API Gateway).
"""
import asyncio

from mangum import Mangum

from src.main import app
from src.workers.plan_generation_worker import handle_sqs_event

# One process-wide event loop, created BEFORE Mangum(app) so Mangum's
# _setup_event_loop() finds it (avoids a throwaway deprecated loop).
# Two reasons (see BLOCKING BUG in .opencode/docs/generation_plan-feature.md):
#   1. Mangum's LifespanCycle calls the deprecated asyncio.get_event_loop(),
#      which RAISES on the Python 3.12 Lambda runtime when no loop is set.
#   2. The SQS branch must run on the SAME loop as the engine's asyncpg pool;
#      a fresh asyncio.run() per record left pooled connections on a stale loop.
_loop = asyncio.new_event_loop()
asyncio.set_event_loop(_loop)

_mangum = Mangum(app)


def handler(event, context):
    records = event.get("Records") if isinstance(event, dict) else None
    if records and records[0].get("eventSource") == "aws:sqs":
        return _loop.run_until_complete(handle_sqs_event(event))
    return _mangum(event, context)
