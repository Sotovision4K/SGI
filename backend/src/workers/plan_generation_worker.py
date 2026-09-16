"""Async plan-generation worker (Phase 2 stub).

The SQS event source mapping triggers the **same** Lambda (`handler.py`) on
`aws:sqs` events. This module hosts the worker entrypoint that the handler
branches to.

Phase 2 scope: the worker only *claims* the job (atomic `queued → running`) so
the enqueue → claim → status plumbing is exercised end-to-end. The actual
segmentation + LLM fan-out + merge lands in Phase 4 (`plan_generation.py`).

# Q: Why a live stub instead of nothing?
# A: Phases 3 (routes enqueue) and 5 (Terraform event-source mapping) both need
#    a stable `run_plan_generation(process_id, consultant_id)` contract to wire
#    against, and
#    `handler.py` needs a target for the SQS branch. A no-op claim is enough to
#    prove the pipeline without blocking on LLM fan-out.
# Decision: stub claims, logs, and returns; real work is Phase 4.
"""

import json
import logging
import uuid

from src.adapters.db.process_repository import ProcessRepository
from src.config.settings import get_settings

logger = logging.getLogger(__name__)


async def run_plan_generation(process_id: uuid.UUID, consultant_id: uuid.UUID) -> None:
    """Entry point for one generation job (called per SQS record).

    # Q: Why re-verify ownership here instead of trusting the queue?
    # A: SQS has no user identity. The enqueue route made the authorization
    #    decision (authenticated user → process.consultant_id) and sealed it
    #    into both the `plan_jobs` row and the SQS message. The worker compares
    #    the message's `consultant_id` against the row's snapshot and rejects
    #    any mismatch — a forged message can't claim a job it wasn't issued for,
    #    even with full write access to the queue.
    # Q: Why the claim guard here and not in the repo call site?
    # A: The claim must be the FIRST mutating step a worker does. Duplicate/
    #    redelivered SQS messages all call this; only the single winner (matching
    #    status='queued' AND the correct consultant_id) proceeds past the atomic
    #    claim. Losers log and return without burning tokens.
    """
    repo = ProcessRepository(database_url=get_settings().database_url)

    job = await repo.get_plan_job(process_id)
    if job is None:
        logger.warning("No plan job found for process %s", process_id)
        return

    if job.consultant_id != consultant_id:
        logger.error(
            "Ownership mismatch — rejecting | process=%s | message_consultant=%s "
            "| job_owner=%s",
            process_id,
            consultant_id,
            job.consultant_id,
        )
        return

    claimed = await repo.claim_job(process_id, consultant_id)
    if not claimed:
        logger.info("Process %s already claimed/running — giving up", process_id)
        return

    logger.info(
        "Claimed plan generation | process=%s | status=running | buckets=%s",
        process_id,
        sorted(job.segments.keys()),
    )

    # Phase 4: snapshot-based split → asyncio.gather(3 buckets) + tenacity +
    #           second-pass retry → merge + dedupe → replace_plan → complete_job.
    # Phase 2 stub: claim only. Job remains `running` until Phase 4 lands.


async def handle_sqs_event(event: dict) -> dict:
    """Process an SQS batch; return partial-batch failures for redelivery.

    # Q: Why partial-batch success (batchItemFailures) instead of failing the
    #    whole batch?
    # A: SQS event-source mapping honors `batchItemFailures` — records listed
    #    there are NOT deleted from the queue and are redelivered (subject to
    #    the queue's retry policy / DLQ), while successful records are removed.
    #    Failing the whole batch would re-run already-completed generations.
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
