"""SQS adapter for the plan-generation queue.

Fire-and-forget enqueue: the caller (the authenticated route) has already
resolved the authorization decision (authenticated user -> process owner) and
seals ``{process_id, consultant_id}`` into the message. The worker re-verifies
ownership on receipt (SQS has no user identity).

# Q: Why sync boto3 wrapped in asyncio.to_thread, instead of aioboto3?
# A: boto3 is already a dependency (the SES adapter uses it). A single
#    `send_message` is quick, so running it on a worker thread avoids blocking
#    the async event loop without pulling in aioboto3 and diverging from the
#    existing SES pattern.
"""

import asyncio
import json
import logging
import uuid

import boto3
from fastapi import Depends

from src.config.settings import Settings, get_settings
from src.errors import QueueEnqueueError
from .queue_port import QueuePort

logger = logging.getLogger(__name__)


class SQSAdapter(QueuePort):
    def __init__(self, settings: Settings) -> None:
        self._queue_url = settings.plan_generation_queue_url
        self._client = boto3.client(
            "sqs", region_name=settings.aws_cognito_region
        )

    async def enqueue_plan_generation(
        self, process_id: uuid.UUID, consultant_id: uuid.UUID
    ) -> None:
        if not self._queue_url:
            raise QueueEnqueueError(
                "PLAN_GENERATION_QUEUE_URL is not configured"
            )

        body = json.dumps(
            {"process_id": str(process_id), "consultant_id": str(consultant_id)}
        )
        try:
            await asyncio.to_thread(
                self._client.send_message,
                QueueUrl=self._queue_url,
                MessageBody=body,
            )
        except Exception as exc:  # noqa: BLE001 — normalize to domain error
            # Log the exception class only: the SDK exception object can embed
            # the queue URL (AWS account id) and request ids.
            logger.error(
                "Failed to enqueue plan generation | process=%s | error=%s",
                process_id,
                type(exc).__name__,
            )
            raise QueueEnqueueError(
                "Failed to enqueue plan generation"
            ) from exc


def get_queue_adapter(settings: Settings = Depends(get_settings)) -> QueuePort:
    # Fail fast while unconfigured: raising here (during dependency resolution)
    # aborts the request BEFORE the route writes any plan_jobs row, so a
    # missing queue never leaves a wedged `queued` job behind.
    if not settings.plan_generation_queue_url:
        raise QueueEnqueueError("PLAN_GENERATION_QUEUE_URL is not configured")
    return SQSAdapter(settings)
