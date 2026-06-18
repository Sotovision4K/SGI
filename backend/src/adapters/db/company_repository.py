import uuid

from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.adapters.db.user_repository import CompanyTable, get_engine


class CompanyRepository:
    def __init__(self, database_url: str) -> None:
        self._engine = get_engine(database_url)

    async def list_companies(self, owner_id: uuid.UUID | None = None) -> list[dict]:
        async with AsyncSession(self._engine) as session:
            stmt = select(CompanyTable).order_by(CompanyTable.company_id)
            if owner_id is not None:
                stmt = stmt.where(CompanyTable.user_id == owner_id)
            rows = (await session.execute(stmt)).scalars().all()
            return [
                {
                    "company_id": str(r.company_id),
                    "user_id": str(r.user_id),
                    "name": r.name or "",
                    "business_type": r.business_type,
                    "is_active": r.is_active,
                }
                for r in rows
            ]

    async def get_company(self, company_id: uuid.UUID) -> dict | None:
        async with AsyncSession(self._engine) as session:
            row = await session.get(CompanyTable, company_id)
            if row is None:
                return None
            return {
                "company_id": str(row.company_id),
                "user_id": str(row.user_id),
                "name": row.name or "",
                "business_type": row.business_type,
                "is_active": row.is_active,
            }

    async def create_company(
        self,
        company_id: uuid.UUID,
        user_id: uuid.UUID,
        name: str,
        business_type: str,
    ) -> dict:
        async with AsyncSession(self._engine) as session:
            row = CompanyTable(
                company_id=company_id,
                user_id=user_id,
                name=name,
                business_type=business_type,
                is_active=True,
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            return {
                "company_id": str(row.company_id),
                "user_id": str(row.user_id),
                "name": row.name or "",
                "business_type": row.business_type,
                "is_active": row.is_active,
            }
