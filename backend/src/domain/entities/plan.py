import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field


class TaskPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Task(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    plan_id: uuid.UUID
    title: str = Field(max_length=200)
    description: str = ""
    priority: TaskPriority = TaskPriority.MEDIUM
    estimated_effort: str = Field(default="", max_length=100)
    owner_role: str = Field(default="", max_length=100)
    sort_order: int = 0

    class Config:
        from_attributes = True


class Plan(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    process_id: uuid.UUID
    summary_md: str = ""
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    tasks: list[Task] = Field(default_factory=list)

    class Config:
        from_attributes = True
