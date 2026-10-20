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

---

# Stage-C smoke findings (2026-09-21)

These are not from the security audit — they came from running the real-stack smoke test
(`.opencode/docs/generation_plan-feature.md` §"Stage C smoke test #1"). They are tracked
here because the fix we shipped is a **stopgap**, not a final design.

## TD-1 — Segment latency budget is a rough stopgap (`max_tokens` 1500 → 4096)

- **Source:** Stage C smoke test — `backend/src/services/plan_generation.py`
  (`_SEGMENT_MAX_TOKENS`, `_SEGMENT_TIMEOUT_SECONDS`), `backend/src/adapters/db/process_repository.py`
  (`LEASE_TTL_SECONDS`), `backend/src/adapters/llm/{llm_port,anthropic_adapter}.py` (defaults),
  `infra/modules/backend/{variables,main}.tf` (Lambda timeout + visibility timeout).
- **Why it's debt:** the smoke test found the segmented plan came back with **empty task
  lists** — `_SEGMENT_MAX_TOKENS=1500` was too small for a 3–5 paragraph summary **plus**
  8–20 tasks (every audit row hit `output_tokens == 1500`). As a stopgap we raised
  `_SEGMENT_MAX_TOKENS` 1500→**4096** (the legacy single-call bound), and bumped the
  companions to keep the pipeline coherent: `_SEGMENT_TIMEOUT_SECONDS` 30→180,
  `LEASE_TTL_SECONDS` 180→300, Lambda timeout 120→600, SQS visibility 300→900.
- **Why it needs further review (not a final fix):**
  1. **The token budget is arbitrary.** 4096 is "the legacy value", not a measured
     requirement. The right fix is to *right-size* the budget against the actual output —
     tighten the prompt to cap summary verbosity + task count (or split summary/tasks into
     two calls) — rather than throw tokens at it.
  2. **No latency model.** The timeout/lease/visibility/Lambda-timeout values are tuned to
     the happy path (all segments succeed first-try, ~80–120 s each). The pathological path
     (a segment hitting `_SEGMENT_TIMEOUT_SECONDS` × 3 tenacity attempts ≈ 547 s) still
     exceeds `LEASE_TTL_SECONDS=300` and approaches the 600 s Lambda timeout, so a
     slow-but-not-dead model can still trigger lease expiry / redelivery / wasted tokens.
  3. **`_SEGMENT_TIMEOUT_SECONDS` enforcement is unverified.** Observed single-call latency
     reached 88 s while the timeout was 30 s (likely the Anthropic SDK's internal retries
     extend the effective window), so the timeout→retry interaction needs confirmation.
- **Acceptance for a real fix:** derive the token budget from the output requirements; model
  worst-case latency (per-call + tenacity + SDK retries) and set
  `_SEGMENT_TIMEOUT_SECONDS` < `LEASE_TTL_SECONDS` < Lambda timeout < visibility timeout
  with real margin; add a guard/test that a persisted plan with **zero tasks** cannot happen
  (e.g. a post-merge "no tasks" check or a prompt-level assertion).

---

# DB access architecture findings (2026-10-07)

Not from the security audit — these came from an exploration of the backend's database
access patterns (no `sessionmaker`, no session separation). Tracked because the current
shape is workable but will not scale cleanly and has several raw-SQL leaks.

## Summary

| ID | Severity | Status | Area | Fix in |
|----|----------|--------|------|--------|
| TD-2 | Medium | Open | DB session/engine layer | Unscheduled (proposed refactor) |

## TD-2 — No session-management layer; DB access only loosely separated

- **Source:** exploration of `backend/` (2026-10-07); no code written for this entry.
- **Why it's debt:**
  1. **No `sessionmaker`/`async_sessionmaker` anywhere.** Every repository method opens a
     session inline: `async with AsyncSession(self._engine) as session:`
     (`process_repository.py` ~24 occurrences; `company_repository.py`; `user_repository.py`).
     There is **no session factory, no per-request session dependency, and no unit-of-work**.
  2. **The engine factory lives in the wrong module.** `get_engine(database_url)` is cached
     in a **module-level global** `_engine` inside `backend/src/adapters/db/user_repository.py:50-70`
     (not `lru_cache`). Every other module imports it from there
     (`company_repository.py:6`, `process_repository.py:15`, `main.py:19`,
     `routes/processes/routes.py:194`). There is no dedicated DB/connection module and
     `adapters/db/__init__.py` is empty.
  3. **Direct DB leaks outside `adapters/db`:**
     - `backend/src/routes/processes/routes.py:193-199` — `_hydrate_company_name()` imports
       `CompanyTable`, `get_engine`, `AsyncSession` and queries inside a **route module**.
     - `backend/src/main.py:36-38` — lifespan `get_engine()` + `engine.begin()`.
     - `backend/src/trigger/post_signup_trigger.py:37-63` — a **separate raw synchronous
       psycopg3** path (`psycopg.connect`, `cur.execute("INSERT INTO users ...")`) that
       bypasses SQLAlchemy/SQLModel entirely.
     - `backend/alembic/env.py` — its own engine (expected for migrations, noted for
       completeness).
  4. **Thin abstraction boundary:** only user access is behind an interface
     (`UserRepositoryPort`). `ProcessRepository`/`CompanyRepository` are concrete classes
     depended on directly and return plain `dict`s (not domain entities).
  5. **Duplicated DI providers:** `get_process_repository` /
     `get_company_repository` are re-declared per route module
     (`routes/processes/routes.py:34-45`, `routes/companies/routes.py:21-32`,
     `routes/profiling/routes.py:31-35`); the worker constructs
     `ProcessRepository(...)` directly (`workers/plan_generation_worker.py:47`).
- **Why it matters:** inconsistent session lifecycles make transactions/atomicity harder to
  reason about, block a proper unit-of-work, and spread DB knowledge (schema + engine) into
  route/service/trigger layers. It also makes swapping the engine/pool config a
  cross-cutting change.
- **Proposed fix (refactor, not urgent):**
  1. New `backend/src/adapters/db/session.py` (or `db.py`): `get_engine(database_url)`
     (moved out of `user_repository.py`) + `async_sessionmaker` + a `get_session()` FastAPI
     dependency yielding an `AsyncSession`.
  2. Inject the session into repositories (per-request unit-of-work) instead of each method
     opening its own `AsyncSession(self._engine)`.
  3. Close the leaks: move `_hydrate_company_name`'s query behind a repository; keep the
     lifespan check but route it through the shared engine; review/unify the raw-psycopg
     trigger path.
  4. Deduplicate the DI providers into one place per repository.
- **Acceptance:** a single session factory + per-request session DI; no `AsyncSession(...)`
  construction outside the db module/repositories; repositories accept an injected session;
  one provider per repository (no duplicates); direct-SQL leaks removed (route, lifespan,
  trigger). Tests continue to use the real in-memory SQLite engine via the same factory.
- **Note:** this is orthogonal to the profiling feature (Phases 1–2); flagged so the
  refactor can be scheduled before more DB-touching features land.

---

# Perfilamiento (wizard refactor) findings (2026-10-08)

From the Phase 3 security/code review of `PUT /processes/{id}/perfilamiento` and
`PUT /processes/{id}/analysis`. Deliberately deferred (owner decision) — not blocking
Phase 3.

## Summary

| ID | Severity | Status | Area | Fix in |
|----|----------|--------|------|--------|
| TD-3 | Medium | Fixed | `analysis_result` input boundary | Increment 5 |
| TD-4 | Low | Open | Profiling write rate limiting | Unscheduled |

## TD-3 — `analysis_result` payload has no size caps (DB bloat / oversized responses)

> **Fixed (Increment 5):** the `Strict*` write-boundary models now enforce
> `pain_points_analysis ≤ 20000`, `range_cop ≤ 500`, `phase.name ≤ 200`, and
> ≤ 50 items for `breakdown`, `time_estimation.phases`, `action_plan.phases`,
> `action_plan.milestones`, and phase `activities` (422 on violation).

- **Source:** Phase 3 — `backend/src/routes/processes/routes.py` (`UpdateAnalysisRequest`,
  `analysis_result: dict`) and `backend/src/domain/entities/profiling.py`
  (`ProfilingResult` string/list fields are all unbounded).
- **Why it's debt:** unlike `answers`/`pain_points` (each capped at 2000/5000 chars),
  `analysis_result` is written verbatim to the `processes.analysis_result` TEXT column and
  echoed in full by `GET /processes/{id}`. An authenticated owner can repeatedly PUT
  multi-MB payloads (only infra limits apply), inflating storage and every subsequent
  `GET` response.
- **Fix:** add `Field(max_length=...)` to the string fields and item-count caps to the
  list fields in `ProfilingResult`/its strict variant (e.g. `pain_points_analysis ≤ 20000`,
  `breakdown ≤ 50`, `activities ≤ 50`), and reject oversized payloads at the route.

## TD-4 — No rate limiting on the two new write endpoints

- **Source:** Phase 3 — `PUT /processes/{id}/perfilamiento` and `PUT /processes/{id}/analysis`.
- **Why it's debt:** `generate_plan` calls `check_rate_limit(...)`; neither new endpoint
  does. Combined with TD-3, an authenticated caller can hammer them with large payloads
  with no throttle.
- **Fix:** add `check_rate_limit(current_user.get("sub", "unknown"), max_requests=…,
  window=…)` at the top of both handlers (mirroring `generate_plan`), ideally with a
  durable (DB-backed) limiter per the L5 note above.

---

# Certificación step findings (2026-10-16)

From the architect review of the certification step plan (dedup scope decision:
**per-consultant**). Deferred by decision, not blocking.

## Summary

| ID | Severity | Status | Area | Fix in |
|----|----------|--------|------|--------|
| TD-5 | Low | Open | ISO dedup partial unique index | Only if rule changes to per-company |

## TD-5 — ISO dedup index is per-consultant; per-company would need a new migration

- **Source:** certification step (planned) — partial unique index on
  `processes (company_id, consultant_id, iso_standard) WHERE iso_standard IS NOT NULL
  AND status <> 'completed'`.
- **Why it's debt:** the index enforces dedup **per-consultant**, matching the existing
  `check-duplicate` / `list_active_by_company` (both scope by `consultant_id`). If the
  business rule should instead be **per-company** (block two different auditors from
  certifying the same company against the same ISO concurrently), the index must drop
  `consultant_id`, and `list_active_by_company` + `check-duplicate` must be re-scoped in
  the same migration — otherwise cross-auditor duplicates remain possible.
- **Fix (only if the rule changes to per-company):** new Alembic migration dropping the
  per-consultant index and adding `(company_id, iso_standard)`; update
  `list_active_by_company` to scope by `company_id` only; update `check-duplicate`
  semantics and the frontend `useProcessDuplicates` pre-warning accordingly.

