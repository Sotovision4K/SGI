"""Async plan-generation worker (SQS entrypoint).

The SQS event source mapping triggers the **same** Lambda (`handler.py`) on
`aws:sqs` events. This module hosts the worker entrypoint that the handler
branches to. The orchestration itself lives in `src.services.plan_generation`.

# Q: Why is this module thin (just wiring)?
# A: Separation of concerns — `plan_generation.generate` is the pure
#    orchestration (claim → fan-out → merge → persist) with injected deps, so
#    it's unit-testable without SQS or AWS. This module only wires settings →
#    repo + LLM adapter and translates an SQS batch into per-record calls.
# Decision: `run_plan_generation` delegates; `handle_sqs_event` owns the
#           partial-batch-failure contract.
"""

import json
import logging
import uuid

from src.adapters.db.process_repository import ProcessRepository
from src.adapters.llm.anthropic_adapter import AnthropicAdapter
from src.adapters.llm.llm_port import LLMPort
from src.config.settings import get_settings
from src.services import plan_generation

logger = logging.getLogger(__name__)


async def run_plan_generation(
    process_id: uuid.UUID,
    consultant_id: uuid.UUID,
    *,
    repo: ProcessRepository | None = None,
    llm: LLMPort | None = None,
) -> None:
    """Entry point for one generation job (called per SQS record).

    Wires settings → repo + LLM adapter, then delegates to the orchestration.
    ``repo``/``llm`` are injectable for tests (the SQS path has no DI container,
    so the worker constructs real deps from settings by default).
    ``generate`` re-verifies ownership and claims the lease; it raises
    ``RetryableError`` only when a whole-job redelivery is wanted (the caller's
    ``handle_sqs_event`` maps that to ``batchItemFailures``).
    """
    settings = get_settings()
    if repo is None:
        repo = ProcessRepository(database_url=settings.database_url)
    if llm is None:
        llm = AnthropicAdapter(
            api_key=settings.anthropic_api_key,
            model=settings.anthropic_model,
        )
    await plan_generation.generate(
        process_id,
        consultant_id,
        repo,
        llm,
        model=settings.anthropic_model,
    )


async def handle_sqs_event(event: dict) -> dict:
    """Process an SQS batch; return partial-batch failures for redelivery.

    # Q: Why partial-batch success (batchItemFailures) instead of failing the
    #    whole batch?
    # A: SQS event-source mapping honors `batchItemFailures` — records listed
    #    there are NOT deleted from the queue and are redelivered (subject to
    #    the queue's retry policy / DLQ), while successful records are removed.
    #    Failing the whole batch would re-run already-completed generations.
    # Q: Why catch-all → batchItemFailures when terminal errors return normally?
    # A: `generate` swallows terminal outcomes (fail_job/complete_job) and only
    #    *raises* RetryableError (redelivery) or an unexpected bug. Retryable
    #    → redeliver; unexpected bugs also redeliver (the DLQ caps them, Phase 5).
    # Decision: per-record try/except; collect failed messageId into
    # `batchItemFailures`; always return 200 so SQS applies the partial result.
    """
    failures: list[dict] = []

    for record in event.get("Records", []):
        message_id = record.get("messageId")
        try:
            body = json.loads(record.get("body", "{}"))
            process_id = uuid.UUID(body["process_id"])
            consultant_id = uuid.UUID(body["consultant_id"])
            await run_plan_generation(process_id, consultant_id)
        except Exception as exc:  # noqa: BLE001 — record isolation
            logger.error("Failed to process SQS record %s: %s", message_id, exc)
            if message_id:
                failures.append({"itemIdentifier": message_id})

    return {
        "statusCode": 200,
        "body": json.dumps({"failed": len(failures)}),
        "batchItemFailures": failures,
    }
