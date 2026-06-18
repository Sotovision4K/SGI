from fastapi import APIRouter
from pydantic import BaseModel
from typing import List

from src.routes.user.auth import CurrentUserDep


router = APIRouter(prefix="/api/v1/processes", tags=["processes"])


class ProcessItem(BaseModel):
    id: str
    name: str
    status: str
    progress: int


class ProcessListResponse(BaseModel):
    items: List[ProcessItem] = []
    total: int = 0


class ProcessDetailResponse(BaseModel):
    id: str
    name: str
    status: str
    progress: int


class CreateProcessRequest(BaseModel):
    name: str
    iso_standard: str | None = None


class DiagnoseResponse(BaseModel):
    process_id: str
    content: str | None = None


class DiagnoseUpsertRequest(BaseModel):
    content: str


class SubResourceStubResponse(BaseModel):
    process_id: str
    items: List[dict] = []
    message: str = "En desarrollo"


@router.get("", response_model=ProcessListResponse)
async def list_processes(current_user: CurrentUserDep) -> ProcessListResponse:
    return ProcessListResponse(items=[], total=0)


@router.get("/{process_id}", response_model=ProcessDetailResponse)
async def get_process(process_id: str, current_user: CurrentUserDep) -> ProcessDetailResponse:
    return ProcessDetailResponse(
        id=process_id,
        name="",
        status="draft",
        progress=0,
    )


@router.post("", response_model=ProcessDetailResponse, status_code=201)
async def create_process(
    payload: CreateProcessRequest,
    current_user: CurrentUserDep,
) -> ProcessDetailResponse:
    return ProcessDetailResponse(
        id="",
        name=payload.name,
        status="draft",
        progress=0,
    )


@router.delete("/{process_id}", status_code=204)
async def delete_process(process_id: str, current_user: CurrentUserDep) -> None:
    return None


@router.get("/{process_id}/diagnose", response_model=DiagnoseResponse)
async def get_diagnose(process_id: str, current_user: CurrentUserDep) -> DiagnoseResponse:
    return DiagnoseResponse(process_id=process_id, content=None)


@router.put("/{process_id}/diagnose", response_model=DiagnoseResponse)
async def upsert_diagnose(
    process_id: str,
    payload: DiagnoseUpsertRequest,
    current_user: CurrentUserDep,
) -> DiagnoseResponse:
    return DiagnoseResponse(process_id=process_id, content=payload.content)


@router.get("/{process_id}/documents", response_model=SubResourceStubResponse)
async def list_documents(process_id: str, current_user: CurrentUserDep) -> SubResourceStubResponse:
    return SubResourceStubResponse(process_id=process_id, message="En desarrollo")


@router.get("/{process_id}/audits", response_model=SubResourceStubResponse)
async def list_audits(process_id: str, current_user: CurrentUserDep) -> SubResourceStubResponse:
    return SubResourceStubResponse(process_id=process_id, message="En desarrollo")


@router.get("/{process_id}/indicators", response_model=SubResourceStubResponse)
async def list_indicators(process_id: str, current_user: CurrentUserDep) -> SubResourceStubResponse:
    return SubResourceStubResponse(process_id=process_id, message="En desarrollo")
