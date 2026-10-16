"""Profiling analysis route (``POST /profiling/analyze``).

Single whole-context LLM call (no chunking). Returns the analysis and does NOT
persist it — the frontend confirmation step saves via ``PUT /processes/{id}/analysis``.

The LLM model is the dedicated ``settings.profiling_model`` (claude-sonnet-5-5),
independent from the plan-generation model, via ``get_profiling_llm``.
"""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from src.adapters.db.process_repository import ProcessRepository
from src.adapters.llm.anthropic_adapter import get_profiling_llm
from src.adapters.llm.llm_port import LLMPort
from src.config.settings import Settings, get_settings
from src.domain.entities.profiling import ProfilingResult
from src.errors import RetryableError, TerminalError
from src.routes.user.auth import CurrentUserDep
from src.services.profiling.service import analyze

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profiling", tags=["profiling"])


def get_process_repository(settings: Settings = Depends(get_settings)) -> ProcessRepository:
    return ProcessRepository(settings.database_url)


ProcessRepositoryDep = Annotated[ProcessRepository, Depends(get_process_repository)]
ProfilingLLMDep = Annotated[LLMPort, Depends(get_profiling_llm)]


class AnalyzeRequest(BaseModel):
    process_id: UUID


@router.post("/analyze", response_model=ProfilingResult)
async def analyze_profiling(
    payload: AnalyzeRequest,
    current_user: CurrentUserDep,
    repo: ProcessRepositoryDep,
    llm: ProfilingLLMDep,
) -> ProfilingResult:
    """Generate the profiling analysis (cost / time / plan / pain points).

    - 404 if the caller does not own the process
    - 502 if the LLM returned an unusable (terminal) response
    - 503 if the LLM failed transiently (retryable) or is unavailable
    """
    sub = current_user.get("sub")
    if not sub:
        raise HTTPException(status_code=400, detail="Sub claim requerido")

    process = await repo.get_process(payload.process_id)
    if process is None or str(process.consultant_id) != sub:
        raise HTTPException(status_code=404, detail="Proceso no encontrado")

    try:
        return await analyze(process, repo, llm)
    except RetryableError as exc:
        # Transient LLM/provider failure — the client may retry later.
        logger.warning("Profiling analysis retryable failure: %s", type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail="Servicio de análisis no disponible. Intente más tarde.",
        ) from exc
    except TerminalError as exc:
        # Permanent failure (unusable/malformed LLM output).
        logger.error("Profiling analysis terminal failure: %s", type(exc).__name__)
        raise HTTPException(
            status_code=502,
            detail="El análisis no pudo generarse. Intente de nuevo.",
        ) from exc
