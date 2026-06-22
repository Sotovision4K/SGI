import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class IsoStandard(str, Enum):
    ISO_9001 = "iso9001"
    ISO_14001 = "iso14001"
    ISO_45001 = "iso45001"


class ProcessStatus(str, Enum):
    IN_DIAGNOSIS = "in_diagnosis"
    PLAN_READY = "plan_ready"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class Process(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    consultant_id: uuid.UUID
    company_id: uuid.UUID
    iso_standard: IsoStandard
    status: ProcessStatus = ProcessStatus.IN_DIAGNOSIS
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(from_attributes=True)
