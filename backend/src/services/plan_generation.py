"""Plan-generation orchestration (Phase 4).

Turns a claimed plan job into a segmented, parallel LLM fan-out and merges the
results into a single ``Plan``.

Flow (spec §3):
1. claim (lease) → read snapshot + process metadata
2. split answers into 3 buckets (``questionnaire_map.json``)
3. ``asyncio.gather`` the buckets with tenacity retry + per-call timeout
4. checkpoint each bucket into ``plan_jobs.segments`` (heartbeat + resume)
5. merge summaries + dedupe tasks (title) + re-stamp ``sort_order``
6. ``replace_plan`` (partial allowed, decision 18) → ``complete_job``

Retry ladder (spec §7, decision 19):
- tenacity retries each segment in-process (transient LLM errors)
- if a segment still fails after tenacity AND the redelivery cap is not reached,
  ``requeue_job`` + raise ``RetryableError`` → SQS redelivers → resume only the
  failed segments (checkpoint)
- terminal errors (and the cap) → merge completed segments and persist partial
- lease lost mid-run (M3) → abandon: no fail/complete/requeue/persist; the SQS
  message is ACKed so the thief's run is the only one left standing
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid

from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from src.adapters.db.process_repository import ProcessRepository
from src.adapters.llm.llm_port import LLMPort, SegmentResult
from src.domain.entities.audit_log import AuditLogLLM, AuditLogStatus
from src.domain.entities.plan import Plan, Task, TaskPriority
from src.domain.entities.plan_job import PlanJob, PlanJobStatus
from src.errors import JobErrorCode, LeaseLostError, RetryableError, TerminalError
from src.services.prompt_builder import (
    build_bucket_prompt,
    build_certification_goal,
    build_system_prompt,
    get_bucket_metadata,
    get_questions_for_standard,
    group_by_bucket,
)
from src.services.sanitizer import sanitize_markdown

logger = logging.getLogger(__name__)

_SEGMENT_BUCKETS = ("B1", "B2", "B3")
_SEGMENT_CONCURRENCY = 3
_MAX_SEGMENT_ATTEMPTS = 3  # tenacity retries per segment (in-process)
_SEGMENT_MAX_TOKENS = 1500
_SEGMENT_TIMEOUT_SECONDS = 30.0
_MAX_REDELIVERIES = 2  # whole-job SQS redeliveries before terminal (Phase 4 cap)

# INVARIANT: worst-case inter-checkpoint gap ≈ _SEGMENT_TIMEOUT_SECONDS(30) ×
# _MAX_SEGMENT_ATTEMPTS(3) + backoff ≈ 95s < LEASE_TTL_SECONDS(180) in
# process_repository. If you raise either constant or the token budget, raise
# LEASE_TTL_SECONDS and the SQS visibility timeout to match.


@retry(
    retry=retry_if_exception_type(RetryableError),
    stop=stop_after_attempt(_MAX_SEGMENT_ATTEMPTS),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
async def _call_segment(
    llm: LLMPort, system_prompt: str, user_prompt: str
) -> SegmentResult:
    """Call the LLM for one segment, retrying transient errors in-process.

    ``RetryableError`` (rate limit, timeout, connection, tool-not-emitted) is
    retried with exponential backoff + jitter; ``TerminalError`` propagates
    immediately (never retried).
    """
    return await llm.generate_segment(
        system_prompt,
        user_prompt,
        max_tokens=_SEGMENT_MAX_TOKENS,
        timeout_seconds=_SEGMENT_TIMEOUT_SECONDS,
    )


async def generate(
    process_id: uuid.UUID,
    consultant_id: uuid.UUID,
    repo: ProcessRepository,
    llm: LLMPort,
    model: str = "",
) -> None:
    """Orchestrate one generation job (claim → fan-out → merge → persist).

    Raises ``RetryableError`` when a whole-job SQS redelivery is needed (the
    caller releases the lease and re-raises). Returns normally on terminal
    outcomes (job failed or completed), so the SQS message is deleted.
    """
    job = await repo.get_plan_job(process_id)
    if job is None:
        logger.warning("No plan job found for process %s", process_id)
        return

    if job.consultant_id != consultant_id:
        logger.error(
            "Ownership mismatch — rejecting | process=%s", process_id
        )
        return

    if job.status == PlanJobStatus.COMPLETED:
        logger.info("Job %s already completed — skipping", process_id)
        return

    claimed = await repo.claim_job(process_id, consultant_id)
    if not claimed:
        # Claim failed. Distinguish the two reasons:
        # (a) job already terminal (failed/missing) → deleting the message is
        #     correct — there's nothing left to resume;
        # (b) job is queued/running with a lease another worker owns (or that
        #     hasn't gone stale yet) → the message is the ONLY thing that will
        #     ever resume this job, so it must be redelivered, not deleted.
        #     (Returning normally here would wedge the job at `running`.)
        if job.status in (PlanJobStatus.QUEUED, PlanJobStatus.RUNNING):
            raise RetryableError(
                f"job {process_id} is {job.status.value}; lease not acquirable"
            )
        logger.info("Process %s already terminal — giving up", process_id)
        return

    try:
        await _generate(process_id, job, repo, llm, model)
    except LeaseLostError:
        # Lease theft mid-run (M3): another worker reclaimed the job, so this
        # run is redundant. Abandon — do NOT fail, complete, requeue, or
        # persist; the thief owns the job now. Returning normally ACKs this
        # (stale) SQS message so it is not redelivered yet again.
        logger.warning(
            "Lease lost mid-run — abandoning | process=%s", process_id
        )
        return
    except RetryableError:
        # Whole-job redelivery: release the lease so the redelivered message
        # re-claims through the normal `queued` path and re-runs only the
        # `pending`/`failed` segments.
        await repo.requeue_job(process_id)
        raise
    except Exception as exc:  # noqa: BLE001 — terminal; never leave a wedged job
        logger.error(
            "Unexpected failure during generation | process=%s | err=%s",
            process_id, type(exc).__name__,
        )
        await repo.fail_job(process_id, JobErrorCode.SEGMENT_GENERATION_FAILED)


async def _generate(
    process_id: uuid.UUID,
    job: PlanJob,
    repo: ProcessRepository,
    llm: LLMPort,
    model: str,
) -> None:
    process = await repo.get_process(process_id)
    if process is None:
        await repo.fail_job(process_id, JobErrorCode.MERGE_FAILED)
        return

    iso_standard = process.iso_standard.value
    company_name = await repo.get_company_name(process.company_id)

    questions = get_questions_for_standard(iso_standard)
    grouped = group_by_bucket(questions)
    bucket_clauses: dict[str, list[str]] = {
        bucket: [q.get("clause", "") for q in grouped[bucket] if q.get("clause")]
        for bucket in _SEGMENT_BUCKETS
    }

    answers = job.findings_snapshot.get("answers", {})
    free_text = job.findings_snapshot.get("free_text", "")
    pre_diagnosis = job.pre_diagnosis_snapshot

    certification_goal = build_certification_goal(pre_diagnosis)
    system_prompt = build_system_prompt(
        company_name, iso_standard, certification_goal
    )

    # Checkpoint resume: only (re)process segments not already completed.
    segments = dict(job.segments)
    pending = [
        b for b in _SEGMENT_BUCKETS
        if segments.get(b, {}).get("status") != "completed"
    ]

    lock = asyncio.Lock()
    sem = asyncio.Semaphore(_SEGMENT_CONCURRENCY)

    if pending:
        results = await asyncio.gather(
            *(
                _process_segment(
                    bucket=bucket,
                    meta=get_bucket_metadata(bucket),
                    questions=grouped[bucket],
                    answers=answers,
                    system_prompt=system_prompt,
                    pre_diagnosis=pre_diagnosis,
                    certification_goal=certification_goal,
                    free_text=free_text,
                    company_name=company_name,
                    iso_standard=iso_standard,
                    process_id=process_id,
                    model=model,
                    llm=llm,
                    repo=repo,
                    segments=segments,
                    lock=lock,
                    sem=sem,
                )
                for bucket in pending
            ),
            return_exceptions=True,
        )

        outcomes: dict[str, str] = {}
        for bucket, result in zip(pending, results):
            if isinstance(result, LeaseLostError):
                # Lease theft mid-run (M3): propagate so generate() abandons
                # without failing or completing the job — never classify it
                # as a terminal segment failure.
                raise result
            if isinstance(result, BaseException):
                logger.error(
                    "Segment %s crashed unexpectedly | process=%s | err=%s",
                    bucket, process_id, type(result).__name__,
                )
                outcomes[bucket] = "terminal"
            else:
                outcomes[bucket] = result

        retryable = [b for b, o in outcomes.items() if o == "retryable"]
        if retryable and job.failed_attempts < _MAX_REDELIVERIES:
            # Checkpoint already persisted by _process_segment; release for
            # redelivery so only the failed segments re-run.
            raise RetryableError(
                f"segment generation failed ({', '.join(retryable)}); redelivery pending"
            )

    # Merge completed segments and persist (partial allowed).
    completed = [
        b for b in _SEGMENT_BUCKETS
        if segments.get(b, {}).get("status") == "completed"
    ]
    if not completed:
        await repo.fail_job(process_id, JobErrorCode.SEGMENT_GENERATION_FAILED)
        return

    plan = _merge(process_id, segments, bucket_clauses)
    try:
        await repo.replace_plan(plan)
    except Exception as exc:  # noqa: BLE001 — persist failure is terminal
        logger.error(
            "replace_plan failed | process=%s | err=%s",
            process_id, type(exc).__name__,
        )
        await repo.fail_job(process_id, JobErrorCode.PLAN_PERSIST_FAILED)
        return
    await repo.complete_job(process_id)


async def _process_segment(
    *,
    bucket: str,
    meta: dict,
    questions: list[dict],
    answers: dict,
    system_prompt: str,
    pre_diagnosis: dict,
    certification_goal: str,
    free_text: str,
    company_name: str,
    iso_standard: str,
    process_id: uuid.UUID,
    model: str,
    llm: LLMPort,
    repo: ProcessRepository,
    segments: dict,
    lock: asyncio.Lock,
    sem: asyncio.Semaphore,
) -> str:
    """Process one bucket; return outcome ('completed'|'retryable'|'terminal')."""
    async with sem:
        clause_list = [q.get("clause", "") for q in questions if q.get("clause")]
        user_prompt = build_bucket_prompt(
            bucket_name=meta.get("name", bucket),
            clause_list=clause_list,
            questions=questions,
            answers=answers,
            company_name=company_name,
            iso_standard=iso_standard,
            pre_diagnosis=pre_diagnosis,
            certification_goal=certification_goal,
            free_text=free_text,
        )

        async with lock:
            segments[bucket]["status"] = "running"
            await repo.update_job_segments(process_id, segments)

        request_payload = {"system": system_prompt, "user": user_prompt}
        started = time.monotonic()
        try:
            result = await _call_segment(llm, system_prompt, user_prompt)
        except RetryableError as exc:
            latency_ms = int((time.monotonic() - started) * 1000)
            await _write_audit(
                repo, process_id=process_id, bucket=bucket, model=model,
                iso_standard=iso_standard, request_payload=request_payload,
                status=AuditLogStatus.RETRYABLE_ERROR, error=type(exc).__name__,
                latency_ms=latency_ms,
            )
            await _checkpoint(segments, bucket, "failed", type(exc).__name__, lock, repo, process_id)
            return "retryable"
        except TerminalError as exc:
            latency_ms = int((time.monotonic() - started) * 1000)
            await _write_audit(
                repo, process_id=process_id, bucket=bucket, model=model,
                iso_standard=iso_standard, request_payload=request_payload,
                status=AuditLogStatus.ERROR, error=type(exc).__name__,
                latency_ms=latency_ms,
            )
            await _checkpoint(segments, bucket, "failed", type(exc).__name__, lock, repo, process_id)
            return "terminal"
        except Exception as exc:  # noqa: BLE001 — unexpected → terminal, never retry
            latency_ms = int((time.monotonic() - started) * 1000)
            await _write_audit(
                repo, process_id=process_id, bucket=bucket, model=model,
                iso_standard=iso_standard, request_payload=request_payload,
                status=AuditLogStatus.ERROR, error=type(exc).__name__,
                latency_ms=latency_ms,
            )
            await _checkpoint(segments, bucket, "failed", type(exc).__name__, lock, repo, process_id)
            return "terminal"

        await _write_audit(
            repo, process_id=process_id, bucket=bucket, model=model,
            iso_standard=iso_standard, request_payload=request_payload,
            response_json={"summary_md": result.summary_md, "tasks": len(result.tasks)},
            status=AuditLogStatus.SUCCESS, input_tokens=result.input_tokens,
            output_tokens=result.output_tokens, latency_ms=result.latency_ms,
        )

        async with lock:
            segments[bucket] = {
                "status": "completed",
                "summary": result.summary_md,
                "tasks": [_task_to_dict(t) for t in result.tasks],
                "error": None,
            }
            await repo.update_job_segments(process_id, segments)
        return "completed"


async def _checkpoint(
    segments: dict,
    bucket: str,
    status: str,
    error: str | None,
    lock: asyncio.Lock,
    repo: ProcessRepository,
    process_id: uuid.UUID,
) -> None:
    async with lock:
        segments[bucket] = {"status": status, "tasks": [], "summary": "", "error": error}
        await repo.update_job_segments(process_id, segments)


async def _write_audit(
    repo: ProcessRepository,
    *,
    process_id: uuid.UUID,
    bucket: str,
    model: str,
    iso_standard: str,
    request_payload: dict,
    status: AuditLogStatus,
    response_json: dict | None = None,
    input_tokens: int = 0,
    output_tokens: int = 0,
    latency_ms: int = 0,
    error: str | None = None,
) -> None:
    """Best-effort audit write; never raises (spec §6/§8)."""
    audit = AuditLogLLM(
        process_id=process_id,
        job_id=process_id,  # 1:1 job→process; job_id == process_id
        bucket=bucket,
        attempt=1,
        model=model,
        iso_standard=iso_standard,
        request_payload=request_payload,
        response_json=response_json,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        latency_ms=latency_ms,
        status=status,
        error=error,
    )
    await repo.insert_audit_log_llm(audit)


def _task_to_dict(task: Task) -> dict:
    """Serialize a Task for the checkpoint (id/plan_id/sort_order re-stamped later)."""
    return {
        "title": task.title,
        "description": task.description,
        "priority": task.priority.value,
        "estimated_effort": task.estimated_effort,
        "owner_role": task.owner_role,
        "require_document": task.require_document,
        "document_title": task.document_title,
    }


def _normalize_title(title: str) -> str:
    return " ".join(title.strip().lower().split())


def _merge(
    process_id: uuid.UUID,
    segments: dict,
    bucket_clauses: dict[str, list[str]],
) -> Plan:
    """Merge completed segments into one Plan (title-dedupe + sort re-stamp)."""
    plan_id = uuid.uuid4()
    summary_parts: list[str] = []
    seen: set[str] = set()
    merged_tasks: list[Task] = []

    for bucket in _SEGMENT_BUCKETS:
        seg = segments.get(bucket, {})
        if seg.get("status") != "completed":
            continue
        if seg.get("summary"):
            name = get_bucket_metadata(bucket).get("name", bucket)
            summary_parts.append(f"## {name}\n\n{seg['summary']}")

        source_clause = ", ".join(bucket_clauses.get(bucket, []))
        for raw in seg.get("tasks", []):
            title = raw.get("title", "")
            key = _normalize_title(title)
            if not title or key in seen:
                continue
            seen.add(key)
            merged_tasks.append(_dict_to_task(raw, plan_id, len(merged_tasks), source_clause))

    return Plan(
        id=plan_id,
        process_id=process_id,
        summary_md="\n\n".join(summary_parts),
        tasks=merged_tasks,
    )


def _dict_to_task(
    raw: dict, plan_id: uuid.UUID, sort_order: int, source_clause: str
) -> Task:
    priority = raw.get("priority", "medium")
    try:
        priority_enum = TaskPriority(priority)
    except ValueError:
        priority_enum = TaskPriority.MEDIUM

    return Task(
        id=uuid.uuid4(),
        plan_id=plan_id,
        title=raw.get("title", "").strip()[:200],
        description=sanitize_markdown(raw.get("description", "").strip()),
        priority=priority_enum,
        estimated_effort=raw.get("estimated_effort", "").strip()[:100],
        owner_role=raw.get("owner_role", "").strip()[:100],
        sort_order=sort_order,
        source_clause=source_clause,
        require_document=bool(raw.get("require_document", False)),
        document_title=(
            sanitize_markdown(raw["document_title"])[:200]
            if raw.get("document_title")
            else None
        ),
    )
