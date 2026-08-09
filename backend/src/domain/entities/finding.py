import uuid
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class Finding(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    process_id: uuid.UUID
    answers: dict[str, Any] = Field(default_factory=dict)
    free_text: str = ""

    # Q: Is updated_at domain metadata or business data?
    # A: Business data — the frontend shows "Last updated: ..." via
    #    GET /findings. Unlike Task/Case metadata fields, this is
    #    consumed by the user-facing API.
    # Decision: Keep on the entity. The mapper passes the DB value so
    #    the response reflects the actual save time, not the factory default.
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(from_attributes=True)
