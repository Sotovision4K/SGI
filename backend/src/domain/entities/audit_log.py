"""LLM audit-log entity (business logic layer).

Spec: generation_plan-feature.md §6 — `audit_logs_llm` stores a record of
every LLM call made during plan generation.

# Q: Why a separate entity from the SQLModel table?
# A: The entity is a pure Pydantic model (no ORM coupling) so business logic
#    can be tested without a DB. The table (in adapters/db) maps to SQL and
#    stores JSONB fields as JSON strings for SQLite compatibility.
# Decision: Keep the domain entity dict-typed for request_payload/response_json
# and let the repository serialize to JSON strings at the boundary.
"""

import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class AuditLogStatus(str, Enum):
    # Q: Why these three statuses?
    # A: success = the LLM returned a usable response; error = non-retryable
    #    failure (e.g. content policy); retryable_error = transient failure
    #    (rate limit, timeout) that the orchestrator will retry.
    # Decision: Reuse the same str-Enum pattern as ProcessStatus/TaskPriority.
    SUCCESS = "success"
    ERROR = "error"
    RETRYABLE_ERROR = "retryable_error"


class AuditLogLLM(BaseModel):
    """Domain entity for a single LLM call audit record."""

    # Q: Which fields are nullable and why?
    # A: job_id — the job may not exist yet at enqueue time (pre-segmentation
    #    calls). bucket — nullable for non-segmented (non-B1/B2/B3) calls.
    #    response_json/error — None until the call completes/fails.
    # Decision: Mirror the spec's nullability exactly so the table schema is
    # a faithful projection of the entity.
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    process_id: uuid.UUID
    job_id: uuid.UUID | None = None  # nullable — job may not exist yet at enqueue
    bucket: str | None = None  # B1, B2, B3 — nullable for non-segmented calls
    attempt: int = 1
    model: str = ""
    iso_standard: str = ""
    request_payload: dict = Field(default_factory=dict)  # sanitized prompt as JSONB
    response_json: dict | None = None  # sanitized LLM response as JSONB
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0
    status: AuditLogStatus = AuditLogStatus.SUCCESS
    error: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Q: Why from_attributes=True?
    # A: Allows constructing the entity from an ORM-like object (the table row)
    #    via AttributeMapping, consistent with the other domain entities.
    # Decision: Match the convention used by User/Process/Plan/Finding.
    model_config = ConfigDict(from_attributes=True)