"""Plan-generation job entity (business logic layer).

Spec: generation_plan-feature.md §6 — `plan_jobs` holds the async generation
job state for a process. It is 1:1 with `processes` (one job row per process),
so `process_id` is the primary key.

# Q: Why is `process_id` the primary key instead of a synthetic `id`?
# A: Each process has at most one job at a time (the enqueue endpoint returns
#    an idempotent `202` while a job is `queued`/`running`). A synthetic id
#    would add a join with no benefit — the natural key is the process itself.
# Decision: process_id is PK/FK → `processes.id`.

# Q: Why two snapshot fields (findings_snapshot / pre_diagnosis_snapshot)?
# A: Consistency. The worker reads ONLY the snapshot captured at enqueue, never
#    the live DB, so a plan always reflects the diagnosis the user submitted —
#    even if the user edits findings while the job is queued/running.
# Decision: Snapshot `findings` + `pre_diagnosis` at enqueue time.

# Q: Why is `consultant_id` on the job (not just on `processes`)?
# A: Ownership is re-verified on every worker call. The enqueue route resolves
#    the authenticated user to `process.consultant_id` and snapshots it here;
#    the worker then compares the message's `consultant_id` against this value
#    and rejects any mismatch. This carries the authorization decision from the
#    authenticated HTTP path into the queue message (SQS has no user identity).
# Decision: snapshot `consultant_id` at enqueue; the worker trusts it only after
# the message's value matches. No `run_token` — the `status='queued'` guard in
# `claim_job` is already sufficient for atomicity.
"""

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class PlanJobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


# Initial per-bucket checkpoint shape for `plan_jobs.segments`.
# Each bucket is keyed B1/B2/B3 and tracks its own status/tasks/summary/error.
def make_default_segments() -> dict[str, dict[str, Any]]:
    """Return the initial 3-bucket checkpoint map.

    # Q: Why a helper instead of a constant?
    # A: dicts are mutable; a module-level constant shared across jobs would
    #    alias and leak mutations between unrelated jobs. A factory returns a
    #    fresh copy every time.
    """
    return {
        bucket: {"status": "pending", "tasks": [], "summary": "", "error": None}
        for bucket in ("B1", "B2", "B3")
    }


class PlanJob(BaseModel):
    """Domain entity for a single plan-generation job (1:1 with a process)."""

    process_id: uuid.UUID  # PK — also FK → processes.id
    consultant_id: uuid.UUID  # process owner — snapshotted at enqueue (ownership)
    status: PlanJobStatus = PlanJobStatus.QUEUED
    error: str | None = None
    segments: dict[str, Any] = Field(default_factory=make_default_segments)
    failed_attempts: int = 0
    findings_snapshot: dict[str, Any] = Field(default_factory=dict)
    pre_diagnosis_snapshot: dict[str, Any] = Field(default_factory=dict)
    source_updated_at: str = ""  # findings.updated_at at enqueue (ISO 8601)
    completed_count: int = 0  # cumulative successful generations (cap)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(from_attributes=True)
