from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, field_validator

from src.routes.user.auth import CurrentUserDep
from src.adapters.db.company_repository import CompanyRepository
from src.adapters.db.process_repository import ProcessRepository
from src.config.settings import Settings, get_settings

VALID_BUSINESS_TYPES = {
    "general", "manufactura", "servicios", "tecnología",
    "construcción", "alimentos", "salud", "otro",
}


router = APIRouter(prefix="/companies", tags=["companies"])


def get_company_repository(settings: Settings = Depends(get_settings)) -> CompanyRepository:
    return CompanyRepository(settings.database_url)


CompanyRepositoryDep = Annotated[CompanyRepository, Depends(get_company_repository)]


def get_process_repository(settings: Settings = Depends(get_settings)) -> ProcessRepository:
    return ProcessRepository(settings.database_url)


ProcessRepositoryDep = Annotated[ProcessRepository, Depends(get_process_repository)]


class CompanyResponse(BaseModel):
    company_id: str
    user_id: str
    name: str
    business_type: str
    is_active: bool
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    active_process_count: int = 0


class CompanyListResponse(BaseModel):
    items: list[CompanyResponse]
    total: int


class CreateCompanyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    business_type: str = Field(default="general", min_length=1, max_length=50)
    business_type_custom: str | None = Field(default=None, max_length=50)
    contact_name: str = Field(min_length=1, max_length=100)
    contact_email: EmailStr
    contact_phone: str | None = Field(default=None, max_length=30)

    @field_validator("business_type")
    @classmethod
    def validate_business_type(cls, v: str) -> str:
        if v not in VALID_BUSINESS_TYPES:
            raise ValueError(f"Tipo de industria no válido: {v}")
        return v

    @field_validator("business_type_custom")
    @classmethod
    def validate_custom_required(cls, v: str | None, info) -> str | None:
        business_type = info.data.get("business_type") if info.data else None
        if business_type == "otro" and (not v or not v.strip()):
            raise ValueError("Debe especificar el tipo de industria cuando selecciona 'Otro'")
        return v

    def effective_business_type(self) -> str:
        if self.business_type == "otro" and self.business_type_custom:
            return self.business_type_custom.strip()
        return self.business_type


@router.get("", response_model=CompanyListResponse)
async def list_companies(
    current_user: CurrentUserDep,
    repo: CompanyRepositoryDep,
    process_repo: ProcessRepositoryDep,
) -> CompanyListResponse:
    sub = current_user.get("sub")
    if not sub:
        raise HTTPException(status_code=400, detail="Sub claim requerido")
    owner_id = UUID(sub)
    companies = await repo.list_companies(owner_id=owner_id)

    # Fetch all this user's processes once and count non-completed per company
    # (avoids importing ProcessTable across repo boundaries — rule #1).
    processes = await process_repo.list_processes(consultant_id=owner_id, status="active")
    active_counts: dict[str, int] = {}
    for p in processes:
        active_counts[str(p.company_id)] = active_counts.get(str(p.company_id), 0) + 1

    items = [
        CompanyResponse(
            **{k: v for k, v in c.items() if k != "active_process_count"},
            active_process_count=active_counts.get(c["company_id"], 0),
        )
        for c in companies
    ]
    return CompanyListResponse(items=items, total=len(items))


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
        business_type=payload.effective_business_type(),
        contact_name=payload.contact_name,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
    )
    # Just created → no processes yet.
    return CompanyResponse(**{**company, "active_process_count": 0})
