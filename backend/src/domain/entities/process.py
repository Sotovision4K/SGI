import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class IsoStandard(str, Enum):
    ISO_9001 = "iso9001"
    ISO_14001 = "iso14001"
    ISO_45001 = "iso45001"


class PerfilamientoModule(str, Enum):
    """Necesidad/requisito seleccionado en el perfilamiento (módulo adaptativo)."""

    OPTIMIZACION = "optimizacion"
    SST = "sst"
    NTS = "nts"
    SOS = "sos"
    PLANIFICACION = "planificacion"


class ProcessStatus(str, Enum):
    PROFILING_PENDING = "profiling_pending"
    IN_DIAGNOSIS = "in_diagnosis"
    PLAN_READY = "plan_ready"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class Process(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    consultant_id: uuid.UUID
    company_id: uuid.UUID
    pre_diagnosis: dict[str, Any] = Field(default_factory=dict)
    # `iso_standard` is nullable: `nts` (sector) and `planificacion` (no cert)
    # do not map to a single ISO standard.
    iso_standard: IsoStandard | None = None
    perfilamiento_module: PerfilamientoModule | None = None
    # ISO certification is a deferred user decision (chosen at a later
    # certification step), NOT derived from the module at creation time.
    needs_certification: bool = False
    perfilamiento_answers: dict[str, Any] = Field(default_factory=dict)
    analysis_result: dict[str, Any] = Field(default_factory=dict)
    status: ProcessStatus = ProcessStatus.IN_DIAGNOSIS
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(from_attributes=True)
