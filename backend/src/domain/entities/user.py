import uuid
from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field


class UserRole(str, Enum):
    ADMIN = "admin"
    EVALUATOR = "evaluator"
    CUSTOMER = "customer"


class User(BaseModel):
    user_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    role: UserRole = UserRole.CUSTOMER
    email: str = Field(max_length=255)
    full_name: str = Field(max_length=100)
    gov_id: str = Field(max_length=20)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = True

    class Config:
        from_attributes = True


class Company(BaseModel):
    company_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    user_id: uuid.UUID
    business_type: str = Field(max_length=50)
    is_active: bool = True
    name: str | None = Field(default=None, max_length=200)

    class Config:
        from_attributes = True


class Consultant(BaseModel):
    consultant_id: uuid.UUID = Field(default_factory=uuid.uuid4)
    user_id: uuid.UUID
    years_experience: int = 0
    certifications: str = Field(max_length=200, default="")

    class Config:
        from_attributes = True