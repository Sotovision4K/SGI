import re
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from src.config.settings import Settings, get_settings
from src.domain.entities.finding import Finding
from src.domain.entities.plan import Plan, Task
from src.domain.entities.process import Process, ProcessStatus, IsoStandard
from src.adapters.db.process_repository import ProcessRepository
from src.adapters.llm.llm_port import LLMPort
from src.adapters.llm.anthropic_adapter import get_anthropic_adapter
from src.routes.user.auth import CurrentUserDep


router = APIRouter(prefix="/processes", tags=["processes"])


def get_process_repository(settings: Settings = Depends(get_settings)) -> ProcessRepository:
    return ProcessRepository(settings.database_url)


ProcessRepositoryDep = Annotated[ProcessRepository, Depends(get_process_repository)]
LLMDep = Annotated[LLMPort, Depends(get_anthropic_adapter)]


# ---- Schemas ---------------------------------------------------------------


class ProcessListItem(BaseModel):
    id: str
    consultant_id: str
    company_id: str
    company_name: str | None = None
    iso_standard: str
    status: str
    created_at: str
    updated_at: str


class ProcessListResponse(BaseModel):
    items: list[ProcessListItem]
    total: int


class CreateProcessRequest(BaseModel):
    company_id: UUID
    iso_standard: IsoStandard


class ProcessDetailResponse(BaseModel):
    id: str
    consultant_id: str
    company_id: str
    company_name: str | None = None
    iso_standard: str
    status: str
    created_at: str
    updated_at: str
    pre_diagnosis: dict[str, Any] = Field(default_factory=dict)


class UpsertFindingsRequest(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)
    free_text: str = ""


class FindingsResponse(BaseModel):
    process_id: str
    answers: dict[str, Any]
    free_text: str
    updated_at: str


class TaskSchema(BaseModel):
    id: str
    title: str
    description: str
    priority: str
    estimated_effort: str
    owner_role: str
    sort_order: int


class PlanResponse(BaseModel):
    process_id: str
    summary_md: str
    generated_at: str
    tasks: list[TaskSchema]


# ---- Helpers ---------------------------------------------------------------


async def _hydrate_company_name(company_id: UUID, settings: Settings) -> str | None:
    from src.adapters.db.user_repository import CompanyTable, get_engine
    from sqlalchemy.ext.asyncio import AsyncSession
    engine = get_engine(settings.database_url)
    async with AsyncSession(engine) as session:
        row = await session.get(CompanyTable, company_id)
        return row.name if row else None


def _process_to_item(process: Process, company_name: str | None) -> ProcessListItem:
    return ProcessListItem(
        id=str(process.id),
        consultant_id=str(process.consultant_id),
        company_id=str(process.company_id),
        company_name=company_name,
        iso_standard=process.iso_standard.value,
        status=process.status.value,
        created_at=process.created_at.isoformat(),
        updated_at=process.updated_at.isoformat(),
    )


def _process_to_detail(process: Process, company_name: str | None) -> ProcessDetailResponse:
    return ProcessDetailResponse(
        id=str(process.id),
        consultant_id=str(process.consultant_id),
        company_id=str(process.company_id),
        company_name=company_name,
        iso_standard=process.iso_standard.value,
        status=process.status.value,
        created_at=process.created_at.isoformat(),
        updated_at=process.updated_at.isoformat(),
        pre_diagnosis=process.pre_diagnosis,
    )


# ---- Authorisation -----------------------------------------------------------


async def _require_process_owner(
    process_id: UUID,
    repo: ProcessRepository,
    current_user: dict,
) -> Process:
    """Fetch a process and verify the current user owns it. Raises 404 always."""
    process = await repo.get_process(process_id)
    if process is None or str(process.consultant_id) != current_user.get("sub", ""):
        raise HTTPException(status_code=404, detail="Proceso no encontrado")
    return process


# ---- Pre-diagnosis schemas -----------------------------------------------

_VALID_ANSWER_KEY = re.compile(r"^[a-z][a-z0-9_]{0,99}$")
_MAX_ANSWER_LENGTH = 2000

class UpdatePreDiagnosisRequest(BaseModel):
    answers: dict[str, str] = Field(
        default_factory=dict,
        description="Pre-diagnosis answers keyed by question ID",
    )

    @field_validator("answers")
    @classmethod
    def validate_answer_keys_and_values(cls, v: dict[str, str]) -> dict[str, str]:
        for key, value in v.items():
            if not isinstance(key, str) or not _VALID_ANSWER_KEY.match(key):
                raise ValueError(f"Clave de respuesta inválida: {key}")
            if not isinstance(value, str):
                raise ValueError(f"El valor de '{key}' debe ser texto")
            if len(value) > _MAX_ANSWER_LENGTH:
                raise ValueError(
                    f"El valor de '{key}' excede el límite de {_MAX_ANSWER_LENGTH} caracteres"
                )
        return v


# ---- Endpoints -------------------------------------------------------------


@router.get("", response_model=ProcessListResponse)
async def list_processes(
    current_user: CurrentUserDep,
    repo: ProcessRepositoryDep,
    settings: Settings = Depends(get_settings),
) -> ProcessListResponse:
    sub = current_user.get("sub")
    consultant_id = UUID(sub) if sub else None
    processes = await repo.list_processes(consultant_id=consultant_id)
    items: list[ProcessListItem] = []

    
    for p in processes:
        name = await _hydrate_company_name(p.company_id, settings)
        items.append(_process_to_item(p, name))
    return ProcessListResponse(items=items, total=len(items))


@router.post("", response_model=ProcessDetailResponse, status_code=201)
async def create_process(
    payload: CreateProcessRequest,
    current_user: CurrentUserDep,
    repo: ProcessRepositoryDep,
    settings: Settings = Depends(get_settings),
) -> ProcessDetailResponse:
    sub = current_user.get("sub")
    if not sub:
        raise HTTPException(status_code=400, detail="Sub claim requerido")
    process = Process(
        consultant_id=UUID(sub),
        company_id=payload.company_id,
        iso_standard=payload.iso_standard,
    )
    created = await repo.create_process(process)
    name = await _hydrate_company_name(created.company_id, settings)
    return _process_to_detail(created, name)


@router.get("/{process_id}", response_model=ProcessDetailResponse)
async def get_process(
    process_id: UUID,
    current_user: CurrentUserDep,
    repo: ProcessRepositoryDep,
) -> ProcessDetailResponse:
    process = await _require_process_owner(process_id, repo, current_user)
    name = await _hydrate_company_name(process.company_id, get_settings())
    return _process_to_detail(process, name)


@router.delete("/{process_id}", status_code=204)
async def delete_process(
    process_id: UUID,
    current_user: CurrentUserDep,
    repo: ProcessRepositoryDep,
) -> None:
    await _require_process_owner(process_id, repo, current_user)
    # Slice 1: deletion is a no-op (full lifecycle in Slice 2/3)
    return None


# ---- Findings --------------------------------------------------------------


@router.get("/{process_id}/findings", response_model=FindingsResponse)
async def get_findings(
    process_id: UUID,
    current_user: CurrentUserDep,
    repo: ProcessRepositoryDep,
) -> FindingsResponse:
    await _require_process_owner(process_id, repo, current_user)
    finding = await repo.get_finding(process_id)
    if finding is None:
        return FindingsResponse(
            process_id=str(process_id),
            answers={},
            free_text="",
            updated_at="",
        )
    return FindingsResponse(
        process_id=str(process_id),
        answers=finding.answers,
        free_text=finding.free_text,
        updated_at=finding.updated_at.isoformat(),
    )


@router.put("/{process_id}/findings", response_model=FindingsResponse)
async def upsert_findings(
    process_id: UUID,
    payload: UpsertFindingsRequest,
    current_user: CurrentUserDep,
    repo: ProcessRepositoryDep,
) -> FindingsResponse:
    await _require_process_owner(process_id, repo, current_user)
    finding = Finding(
        process_id=process_id,
        answers=payload.answers,
        free_text=payload.free_text,
    )
    saved = await repo.upsert_finding(finding)
    return FindingsResponse(
        process_id=str(process_id),
        answers=saved.answers,
        free_text=saved.free_text,
        updated_at=saved.updated_at.isoformat(),
    )


# ---- Pre-diagnosis ---------------------------------------------------------


@router.put("/{process_id}/pre-diagnosis", response_model=ProcessDetailResponse)
async def update_pre_diagnosis(
    process_id: UUID,
    payload: UpdatePreDiagnosisRequest,
    current_user: CurrentUserDep,
    repo: ProcessRepositoryDep,
    settings: Settings = Depends(get_settings),
) -> ProcessDetailResponse:
    """Persist pre-diagnosis answers for a process. Requires process ownership."""
    await _require_process_owner(process_id, repo, current_user)
    await repo.update_pre_diagnosis(process_id, payload.answers)
    refreshed = await repo.get_process(process_id)
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Proceso no encontrado")
    name = await _hydrate_company_name(refreshed.company_id, settings)
    return _process_to_detail(refreshed, name)


# ---- Plan ------------------------------------------------------------------


@router.get("/{process_id}/plan", response_model=PlanResponse)
async def get_plan(
    process_id: UUID,
    current_user: CurrentUserDep,
    repo: ProcessRepositoryDep,
) -> PlanResponse:
    await _require_process_owner(process_id, repo, current_user)
    plan = await repo.get_plan(process_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    return PlanResponse(
        process_id=str(plan.process_id),
        summary_md=plan.summary_md,
        generated_at=plan.generated_at.isoformat(),
        tasks=[
            TaskSchema(
                id=str(t.id),
                title=t.title,
                description=t.description,
                priority=t.priority.value,
                estimated_effort=t.estimated_effort,
                owner_role=t.owner_role,
                sort_order=t.sort_order,
            )
            for t in plan.tasks
        ],
    )


@router.post("/{process_id}/generate-plan", response_model=PlanResponse)
async def generate_plan(
    process_id: UUID,
    current_user: CurrentUserDep,
    repo: ProcessRepositoryDep,
    llm: LLMDep,
) -> PlanResponse:
    process = await _require_process_owner(process_id, repo, current_user)

    finding = await repo.get_finding(process_id)
    if finding is None or not finding.answers:
        raise HTTPException(
            status_code=400,
            detail="Debe completar el diagnóstico antes de generar el plan",
        )

    try:
        raw_plan = await llm.generate_plan(
            iso_standard=process.iso_standard.value,
            findings={"answers": finding.answers, "free_text": finding.free_text},
            pre_diagnosis=process.pre_diagnosis,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Error al generar el plan. Intente nuevamente.",
        ) from exc

    plan = Plan(
        id=raw_plan.id,
        process_id=process_id,
        summary_md=raw_plan.summary_md,
        tasks=[
            Task(
                id=t.id,
                plan_id=raw_plan.id,
                title=t.title,
                description=t.description,
                priority=t.priority,
                estimated_effort=t.estimated_effort,
                owner_role=t.owner_role,
                sort_order=t.sort_order,
            )
            for t in raw_plan.tasks
        ],
    )

    saved = await repo.replace_plan(plan)
    await repo.update_process_status(process_id, ProcessStatus.PLAN_READY)

    return PlanResponse(
        process_id=str(saved.process_id),
        summary_md=saved.summary_md,
        generated_at=saved.generated_at.isoformat(),
        tasks=[
            TaskSchema(
                id=str(t.id),
                title=t.title,
                description=t.description,
                priority=t.priority.value,
                estimated_effort=t.estimated_effort,
                owner_role=t.owner_role,
                sort_order=t.sort_order,
            )
            for t in saved.tasks
        ],
    )
