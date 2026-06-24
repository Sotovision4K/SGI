from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.routes.user.auth import CurrentUserDep
from src.adapters.db.company_repository import CompanyRepository
from src.config.settings import Settings, get_settings


router = APIRouter(prefix="/companies", tags=["companies"])


def get_company_repository(settings: Settings = Depends(get_settings)) -> CompanyRepository:
    return CompanyRepository(settings.database_url)


CompanyRepositoryDep = Annotated[CompanyRepository, Depends(get_company_repository)]


class CompanyResponse(BaseModel):
    company_id: str
    user_id: str
    name: str
    business_type: str
    is_active: bool


class CompanyListResponse(BaseModel):
    items: list[CompanyResponse]
    total: int


class CreateCompanyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    business_type: str = Field(default="general", min_length=1, max_length=50)


@router.get("", response_model=CompanyListResponse)
async def list_companies(
    current_user: CurrentUserDep,
    repo: CompanyRepositoryDep,
) -> CompanyListResponse:
    sub = current_user.get("sub")
    owner_id = UUID(sub) if sub else None
    items = await repo.list_companies(owner_id=owner_id)
    return CompanyListResponse(items=[CompanyResponse(**i) for i in items], total=len(items))


@router.get("/{company_id}", response_model=CompanyResponse)
async def get_company(
    company_id: UUID,
    current_user: CurrentUserDep,
    repo: CompanyRepositoryDep,
) -> CompanyResponse:
    company = await repo.get_company(company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    if company.get("user_id") != current_user.get("sub", ""):
        raise HTTPException(status_code=403, detail="No autorizado")
    return CompanyResponse(**company)


@router.post("", response_model=CompanyResponse, status_code=201)
async def create_company(
    payload: CreateCompanyRequest,
    current_user: CurrentUserDep,
    repo: CompanyRepositoryDep,
) -> CompanyResponse:
    sub = current_user.get("sub")
    if not sub:
        raise HTTPException(status_code=400, detail="Sub claim requerido")
    import uuid as _uuid
    company = await repo.create_company(
        company_id=_uuid.uuid4(),
        user_id=UUID(sub),
        name=payload.name,
        business_type=payload.business_type,
    )
    return CompanyResponse(**company)
