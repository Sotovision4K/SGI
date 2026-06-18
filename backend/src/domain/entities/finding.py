import uuid
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field


class Finding(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    process_id: uuid.UUID
    answers: dict[str, Any] = Field(default_factory=dict)
    free_text: str = ""
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Config:
        from_attributes = True
