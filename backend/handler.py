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

_mangum = Mangum(app)


def handler(event, context):
    records = event.get("Records") if isinstance(event, dict) else None
    if records and records[0].get("eventSource") == "aws:sqs":
        return asyncio.run(handle_sqs_event(event))
    return _mangum(event, context)
