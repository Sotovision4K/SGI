import logging
import re
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from src.config.settings import Settings, get_settings
from src.domain.entities.finding import Finding
from src.domain.entities.process import Process, ProcessStatus, IsoStandard
from src.domain.entities.plan_job import PlanJob, make_default_segments
from src.adapters.db.process_repository import ProcessRepository
from src.adapters.db.company_repository import CompanyRepository
from src.adapters.queue.queue_port import QueuePort
from src.adapters.queue.sqs_adapter import get_queue_adapter
from src.errors import GenerationLimitError, MissingFindingsError, QueueEnqueueError, JobErrorCode
from src.routes.rate_limit import check_rate_limit
from src.adapters.email.email_port import EmailPort
from src.adapters.email.ses_adapter import get_email_adapter
from src.routes.user.auth import CurrentUserDep


router = APIRouter(prefix="/processes", tags=["processes"])

logger = logging.getLogger(__name__)

# Hard cap on successful generations per process (spec §2). Only `completed`
# jobs count against it — failed/running/queued jobs do not burn an attempt.
_GENERATION_CAP = 3


def get_process_repository(settings: Settings = Depends(get_settings)) -> ProcessRepository:
    return ProcessRepository(settings.database_url)


def get_company_repository(settings: Settings = Depends(get_settings)) -> CompanyRepository:
    return CompanyRepository(settings.database_url)


ProcessRepositoryDep = Annotated[ProcessRepository, Depends(get_process_repository)]
CompanyRepositoryDep = Annotated[CompanyRepository, Depends(get_company_repository)]
QueueDep = Annotated[QueuePort, Depends(get_queue_adapter)]
EmailDep = Annotated[EmailPort, Depends(get_email_adapter)]


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
    # Length caps (security audit H1): free_text and each answer value are
    # bounded at the boundary so an oversized submission can't bloat the
    # snapshot and then every bucket prompt across retries/redeliveries.
    answers: dict[str, Any] = Field(default_factory=dict)
    free_text: str = Field(default="", max_length=5000)

    @field_validator("answers")
    @classmethod
    def validate_answer_lengths(cls, v: dict[str, Any]) -> dict[str, Any]:
        for key, value in v.items():
            if isinstance(value, str) and len(value) > 2000:
                raise ValueError(
                    f"El valor de '{key}' excede el límite de 2000 caracteres"
                )
        return v


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
    source_clause: str = ""
    require_document: bool = False
    document_title: str | None = None


class PlanResponse(BaseModel):
    process_id: str
    summary_md: str
    generated_at: str
    tasks: list[TaskSchema]


class PlanGenerationEnqueueResponse(BaseModel):
    job_id: str
    status: str


class PlanGenerationStatusResponse(BaseModel):
    process_id: str
    status: str
    error: str | None = None
    segments: dict[str, Any] = Field(default_factory=dict)
    created_at: str
    updated_at: str


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


# ---- Authorization -----------------------------------------------------------


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
    status: str | None = Query(None, enum=["active", "completed"]),
) -> ProcessListResponse:
    sub = current_user.get("sub")
    if not sub:
        raise HTTPException(status_code=400, detail="Sub claim requerido")
    consultant_id = UUID(sub)
    rows = await repo.list_processes_with_company(consultant_id=consultant_id, status=status)
    items = [_process_to_item(p, name) for p, name in rows]
    return ProcessListResponse(items=items, total=len(items))


@router.post("", response_model=ProcessDetailResponse, status_code=201)
async def create_process(
    payload: CreateProcessRequest,
    current_user: CurrentUserDep,
    repo: ProcessRepositoryDep,
    company_repo: CompanyRepositoryDep,
    email_adapter: EmailDep,
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

    # Fire-and-forget welcome email to the company's contact. Errors are
    # logged and swallowed by the adapter; this never affects the response.
    try:
        company = await company_repo.get_company(payload.company_id)
        contact_email = company.get("contact_email") if company else None
        if contact_email:
            await email_adapter.send_welcome_email(
                to=contact_email,
                company_name=name or "",
                iso_standard=created.iso_standard.value,
            )
    except Exception as exc:  # noqa: BLE001 — email must never break process creation
        logger.warning("Welcome email failed for process %s: %s", created.id, exc)

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


# ---- Complete / Reopen lifecycle -------------------------------------------


@router.post("/{process_id}/complete", response_model=ProcessDetailResponse)
async def complete_process(
    process_id: UUID,
    current_user: CurrentUserDep,
    repo: ProcessRepositoryDep,
    settings: Settings = Depends(get_settings),
) -> ProcessDetailResponse:
    """Mark a process as COMPLETED. 409 if already completed."""
    process = await _require_process_owner(process_id, repo, current_user)
    if process.status == ProcessStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="El proceso ya está completado")
    await repo.update_process_status(process_id, ProcessStatus.COMPLETED)
    refreshed = await repo.get_process(process_id)
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Proceso no encontrado")
    name = await _hydrate_company_name(refreshed.company_id, settings)
    return _process_to_detail(refreshed, name)


@router.post("/{process_id}/reopen", response_model=ProcessDetailResponse)
async def reopen_process(
    process_id: UUID,
    current_user: CurrentUserDep,
    repo: ProcessRepositoryDep,
    settings: Settings = Depends(get_settings),
) -> ProcessDetailResponse:
    """Reopen a completed process back to IN_PROGRESS. 409 if not completed."""
    process = await _require_process_owner(process_id, repo, current_user)
    if process.status != ProcessStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="El proceso no está completado")
    await repo.update_process_status(process_id, ProcessStatus.IN_PROGRESS)
    refreshed = await repo.get_process(process_id)
    if refreshed is None:
        raise HTTPException(status_code=404, detail="Proceso no encontrado")
    name = await _hydrate_company_name(refreshed.company_id, settings)
    return _process_to_detail(refreshed, name)


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
                source_clause=t.source_clause,
                require_document=t.require_document,
                document_title=t.document_title,
            )
            for t in plan.tasks
        ],
    )


@router.post(
    "/{process_id}/generate-plan",
    response_model=PlanGenerationEnqueueResponse,
    status_code=202,
)
async def generate_plan(
    process_id: UUID,
    current_user: CurrentUserDep,
    repo: ProcessRepositoryDep,
    queue: QueueDep,
) -> PlanGenerationEnqueueResponse:
    """Enqueue an async plan generation (snapshot + one SQS message).

    Flow (spec §2/§4):
    - auth + rate-limit + ownership
    - missing findings → 400
    - hard cap reached → 429
    - an active job already exists → idempotent 202 reuse (no re-enqueue)
    - else snapshot findings+pre_diagnosis → create_plan_job → SQS send → 202
    """
    check_rate_limit(current_user.get("sub", "unknown"), max_requests=5, window=60)
    process = await _require_process_owner(process_id, repo, current_user)

    finding = await repo.get_finding(process_id)
    if finding is None or not finding.answers:
        raise MissingFindingsError(
            "Debe completar el diagnóstico antes de generar el plan"
        )

    completed = await repo.get_completed_count(process_id)
    if completed >= _GENERATION_CAP:
        raise GenerationLimitError(
            f"Límite de generaciones alcanzado ({_GENERATION_CAP})"
        )

    active = await repo.get_active_job(process_id)
    if active is not None:
        return PlanGenerationEnqueueResponse(
            job_id=str(active.process_id),
            status=active.status.value,
        )

    job = PlanJob(
        process_id=process_id,
        consultant_id=process.consultant_id,
        findings_snapshot={"answers": finding.answers, "free_text": finding.free_text},
        pre_diagnosis_snapshot=process.pre_diagnosis,
        source_updated_at=finding.updated_at.isoformat(),
        segments=make_default_segments(),
    )
    created = await repo.create_plan_job(job)

    # Re-check the cap against the row we just wrote: the initial read above is
    # a snapshot, and a concurrent worker could have completed a generation in
    # between, pushing `completed_count` to the cap after we passed the check.
    # The upsert preserves the cumulative counter, so the returned row is
    # authoritative.
    if created.completed_count >= _GENERATION_CAP:
        await repo.fail_job(process_id, JobErrorCode.GENERATION_LIMIT_EXCEEDED)
        raise GenerationLimitError(
            f"Límite de generaciones alcanzado ({_GENERATION_CAP})"
        )

    try:
        await queue.enqueue_plan_generation(process_id, process.consultant_id)
    except QueueEnqueueError:
        # Job row exists but no message will ever reach the worker — mark it
        # failed so the user can retry cleanly rather than leaving a wedged
        # `queued` job. Re-raise → 503 via the global handler.
        try:
            await repo.fail_job(process_id, JobErrorCode.QUEUE_ENQUEUE_FAILED)
        except Exception:  # noqa: BLE001 — DB failure must not mask the 503
            logger.error(
                "Failed to mark job failed after enqueue error | process=%s",
                process_id,
                exc_info=True,
            )
        raise

    return PlanGenerationEnqueueResponse(
        job_id=str(created.process_id),
        status=created.status.value,
    )


@router.get(
    "/{process_id}/plan-generation/status",
    response_model=PlanGenerationStatusResponse,
)
async def get_plan_generation_status(
    process_id: UUID,
    current_user: CurrentUserDep,
    repo: ProcessRepositoryDep,
) -> PlanGenerationStatusResponse:
    await _require_process_owner(process_id, repo, current_user)
    job = await repo.get_plan_job(process_id)
    if job is None:
        raise HTTPException(status_code=404, detail="No hay generación en curso")
    return PlanGenerationStatusResponse(
        process_id=str(job.process_id),
        status=job.status.value,
        error=job.error,
        segments=job.segments,
        created_at=job.created_at.isoformat(),
        updated_at=job.updated_at.isoformat(),
    )
