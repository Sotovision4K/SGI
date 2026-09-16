# Technical Debt

Tracked issues discovered by the `security-auditor` review of the async plan-generation
pipeline (Phases 0–2). Each entry maps to its source phase + file, the phase where it
must be fixed, why it matters, and where the change should land.

Source spec: `.opencode/docs/generation_plan-feature.md`.

## Summary

| ID | Severity | Status | Source | Fix in |
|----|----------|--------|--------|--------|
| H1 | High | **Fixed** (Phase 2) | Phase 2 worker | — |
| M1 | Medium | Open | Phase 2 repo | Phase 3 |
| M2 | Medium | Open | Phase 2 repo | Phase 4 |
| M3 | Medium | Open | Phase 2 repo | Phase 4 |
| L1 | Low | Open | Phase 2 handler | Phase 3 |
| L2 | Low | Open | Phase 2 worker | Phase 5 |
| L3 | Low | Open | Phase 2 schema | Phase 5+ |
| L4 | Low | Open | Phase 5 Terraform | Phase 5 |
| L5 | Low | Open | Phase 2 (missing) | Phase 3 |

---

## H1 — Worker path had no authn/authz (trusted the queue) — **FIXED**

- **Source phase / file:** Phase 2 — `backend/src/workers/plan_generation_worker.py`
  (`run_plan_generation`) and the SQS branch in `backend/handler.py`.
- **Why (was):** SQS messages carry no user identity. Before the fix, the worker
  trusted the queue origin and claimed any job blindly — a forged message (or any
  principal with `sqs:SendMessage` on the queue) could trigger generation.
- **Fix (done in Phase 2):** `consultant_id` binding (spec decision 13). The enqueue
  route seals `process.consultant_id` into the `plan_jobs` snapshot and the SQS
  message; the worker re-verifies `message.consultant_id == job.consultant_id` and
  rejects mismatches. `claim_job` folds the ownership check into the atomic
  `UPDATE … WHERE status='queued' AND consultant_id=:cid`.
- **Remaining:** Phase 5 must also restrict the queue policy so only the Lambda role
  can `sqs:SendMessage` (defense in depth). See L5 / Phase 5 Terraform checklist.

## M1 — `create_plan_job` is a non-atomic read-then-write (TOCTOU)

- **Source phase / file:** Phase 2 — `backend/src/adapters/db/process_repository.py`
  `create_plan_job` (line ~424): reads `existing`, then either returns it, mutates it
  to `queued`, or inserts a new row.
- **Fix in:** Phase 3 (enqueue `POST`).
- **Why:** Two concurrent enqueue requests race:
  1. Both read `existing is None` → one `INSERT` succeeds, the other raises
     `IntegrityError` on the PK → **500** instead of an idempotent 202/429.
  2. Both read `existing.status = 'completed'` → both reset to `queued` → **two SQS
     messages** sent for one user action (double `completed_count`, wasted tokens).
  The frontend blocks double-clicks, but the race is still reachable under retries,
  SQS redelivery racing a manual "Reintentar", or an API-level retry.
- **Where:** `create_plan_job` in `process_repository.py`. Make the transition atomic
  in one statement rather than read→mutate→write. Preferred (Postgres):
  `INSERT … ON CONFLICT (process_id) DO UPDATE SET … WHERE plan_jobs.status NOT IN
  ('queued','running')`. Cross-dialect alternative (SQLite tests use aiosqlite): keep
  the INSERT path but catch `IntegrityError` and fall back to the reuse/upsert logic.
  The enqueue route should additionally treat the race outcome as idempotent (202).

## M2 — No stale-lease recovery for `running` jobs

- **Source phase / file:** Phase 2 — `backend/src/adapters/db/process_repository.py`
  `claim_job` (line ~493) / `complete_job` / `fail_job`; no lease/expiry column on
  `PlanJobTable` (`backend/src/domain/entities/plan_job.py`).
- **Fix in:** Phase 4 (worker fan-out in `plan_generation.py`).
- **Why:** If a worker crashes mid-generation (Lambda timeout, OOM, error), the job is
  left `status='running'` forever. The claim guard (`WHERE status='queued'`) then
  refuses every subsequent retry, so the process is **permanently wedged** — the user
  can never regenerate without a manual DB edit.
- **Where:** add a lease/expiry to the job row (e.g. `claimed_at` / `lease_expires_at`)
  on `PlanJobTable`, set it in `claim_job`, and let `claim_job` (or a recovery path)
  reclaim `running` jobs whose lease has expired. Thread a run/attempt token through
  `complete_job` / `fail_job` so a stale worker can't overwrite a newer attempt.

## M3 — Unsanitized error strings persisted and logged verbatim

- **Source phase / file:** Phase 2 — `backend/src/adapters/db/process_repository.py`
  `fail_job` (line ~560, stores `error`), and the worker's `except Exception as exc`
  path (`plan_generation_worker.py`).
- **Fix in:** Phase 4 (real worker error handling).
- **Why:** `str(exc)` from a misbehaving LLM/adapter may embed prompt fragments,
  document excerpts, or tool payloads — persisted to `plan_jobs.error` and echoed into
  CloudWatch logs. Leaks PII/ISO content into logs and the DB, and makes the stored
  error non-actionable for the UI.
- **Where:** in the Phase 4 worker and `fail_job`, replace raw exception text with a
  fixed error taxonomy (reuse `src/errors.py`: `RetryableError` / `TerminalError`) plus
  a correlation id. Persist only the enum + correlation id; log the correlation id, not
  the message body.

## L1 — Event-shape routing is fragile

- **Source phase / file:** Phase 2 — `backend/handler.py` (line ~18):
  `records[0].get("eventSource") == "aws:sqs"`.
- **Fix in:** Phase 3.
- **Why:** If an event arrives with an empty `Records` list, `records[0]` raises
  `IndexError`. Also relies on a single key rather than a clear dispatch predicate.
- **Where:** `handler.py` — guard `records` for non-empty before indexing, or dispatch
  on the presence of `records[0].get("eventSource")` with a safe default to Mangum.

## L2 — Poison messages misclassified as retryable

- **Source phase / file:** Phase 2 — `backend/src/workers/plan_generation_worker.py`
  `handle_sqs_event` (line ~79): every exception is returned in `batchItemFailures`.
- **Fix in:** Phase 5.
- **Why:** A permanently-bad message (malformed body, unknown process_id) is treated as
  retryable, so SQS redelivers it indefinitely until the DLQ trips — burning
  visibility-timeout cycles and delaying real messages.
- **Where:** `handle_sqs_event` — classify errors as retryable vs terminal (reuse
  `src/errors.py`). Terminal errors should NOT be added to `batchItemFailures` (or
  should be routed to a dead-letter path explicitly), so they drop out of the queue.

## L3 — Snapshot data duplicated at rest with no retention policy

- **Source phase / file:** Phase 2 — `backend/src/domain/entities/plan_job.py`
  (`findings_snapshot`, `pre_diagnosis_snapshot`) + `PlanJobTable` columns.
- **Fix in:** Phase 5+ (or before production growth).
- **Why:** Every regeneration snapshots `findings` + `pre_diagnosis` (potentially large
  JSON) into `plan_jobs`, which already lives 1:1 next to the live data in
  `processes`/`findings`. Unbounded growth and duplicated sensitive content at rest.
- **Where:** define a purge/retention rule (e.g. clear snapshots on `completed`, or
  expire them after N days) and enforce it in the job lifecycle (repo layer).

## L4 — `batchItemFailures` needs `FunctionResponseTypes` on the event source mapping

- **Source phase / file:** Phase 5 — Terraform event-source mapping (not yet created;
  the worker's `batchItemFailures` contract is already correct in
  `plan_generation_worker.py`).
- **Fix in:** Phase 5.
- **Why:** Without `FunctionResponseTypes = ["ReportBatchItemFailures"]`, Lambda ignores
  the returned `batchItemFailures` and the partial-batch-success behavior silently stops
  working — every failed record is treated as fully processed.
- **Where:** the Terraform SQS event-source mapping resource (`infra/modules/backend`)
  — add `function_response_types = ["ReportBatchItemFailures"]`.

## L5 — No durable rate limiting on the worker path

- **Source phase / file:** Phase 2 (gap) — worker has no limiter; the only limiter
  (`backend/src/routes/rate_limit.py`) is an in-memory dict, ineffective across Lambda
  invocations.
- **Fix in:** Phase 3.
- **Why:** The generation cap (max 3) and rate limits are enforced only at the HTTP
  enqueue route. An in-memory limiter is per-invocation on Lambda, so concurrent
  invocations don't share state — the worker path itself has no back-pressure and can
  be hammered via the queue.
- **Where:** enforce the cap/rate limit at the enqueue route (`create_plan_job` callers
  in `backend/src/routes/processes/routes.py`) using durable state (DB-driven
  `completed_count` + job status), rather than relying on the in-memory
  `rate_limit.py`. Consider a DB-backed or queue-visibility-backed guard for the
  worker if direct queue writes become a threat vector.
