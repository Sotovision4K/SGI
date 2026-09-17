"""Unit tests for the SQS worker entrypoint (`handle_sqs_event`).

Covers the partial-batch-failure contract (code-review M6): a raised
`RetryableError` → `batchItemFailures` (redelivered); a normal return → success
(deleted); a malformed record → isolated per-record failure.
"""

import json
import uuid
from unittest.mock import AsyncMock, patch

import pytest

from src.errors import RetryableError


def _record(body: dict, message_id: str = "m1") -> dict:
    return {"messageId": message_id, "body": json.dumps(body)}


def _event(*records: dict) -> dict:
    return {"Records": list(records)}


def _valid_body() -> dict:
    return {"process_id": str(uuid.uuid4()), "consultant_id": str(uuid.uuid4())}


@pytest.mark.asyncio
async def test_retryable_error_maps_to_batch_failures():
    from src.workers.plan_generation_worker import handle_sqs_event

    run = AsyncMock(side_effect=RetryableError("lease not acquirable"))
    with patch("src.workers.plan_generation_worker.run_plan_generation", run):
        result = await handle_sqs_event(_event(_record(_valid_body())))

    assert result["statusCode"] == 200
    assert result["batchItemFailures"] == [{"itemIdentifier": "m1"}]


@pytest.mark.asyncio
async def test_success_returns_no_failures():
    from src.workers.plan_generation_worker import handle_sqs_event

    run = AsyncMock(return_value=None)
    with patch("src.workers.plan_generation_worker.run_plan_generation", run):
        result = await handle_sqs_event(_event(_record(_valid_body())))

    assert result["batchItemFailures"] == []


@pytest.mark.asyncio
async def test_malformed_record_is_isolated():
    from src.workers.plan_generation_worker import handle_sqs_event

    # First record valid, second record missing `process_id` (KeyError on parse).
    event = _event(
        _record(_valid_body(), message_id="ok"),
        _record({"consultant_id": str(uuid.uuid4())}, message_id="bad"),
    )

    run = AsyncMock(return_value=None)
    with patch("src.workers.plan_generation_worker.run_plan_generation", run):
        result = await handle_sqs_event(event)

    # Only the malformed record is listed for redelivery; the good one succeeds.
    assert result["batchItemFailures"] == [{"itemIdentifier": "bad"}]
    assert run.await_count == 1  # valid record still processed
