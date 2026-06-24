import uuid
from datetime import datetime, timezone
from typing import Annotated

from sqlmodel import SQLModel, Field, select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

from src.domain.entities.user import User, UserRole
from src.domain.repositories.user_repository import UserRepositoryPort


class UserTable(SQLModel, table=True):
    __tablename__ = "users"

    user_id: uuid.UUID = Field(primary_key=True)
    role: str = Field(nullable=False)
    email: str = Field(max_length=255, unique=True, index=True)
    full_name: str = Field(max_length=100)
    gov_id: str = Field(max_length=20)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_active: bool = Field(default=True)


class CompanyTable(SQLModel, table=True):
    __tablename__ = "company"

    company_id: uuid.UUID = Field(primary_key=True)
    user_id: uuid.UUID = Field(index=True)
    business_type: str = Field(max_length=50)
    is_active: bool = Field(default=True)
    name: str | None = Field(default=None, max_length=200)


class ConsultantTable(SQLModel, table=True):
    __tablename__ = "consultant"

    consultant_id: uuid.UUID = Field(primary_key=True)
    user_id: uuid.UUID = Field(index=True)
    years_experience: int = Field(default=0)
    certifications: str = Field(max_length=200, default="")


_engine = None


def get_engine(database_url: str):
    """Get or create database engine (thread-safe for initialization)"""
    global _engine
    if _engine is None:
        # Set echo=False to prevent SQL queries and sensitive data from appearing in logs
        _engine = create_async_engine(
            database_url, 
            echo=False,  # Disabled in production - prevents sensitive data leakage
            pool_pre_ping=True,  # Verify connections before using them
            pool_recycle=3600,  # Recycle connections every hour
            connect_args={"timeout": 5},  # Fail fast if DB unreachable (vs 30s default)
        )
    return _engine


class PostgresUserRepository(UserRepositoryPort):
    def __init__(self, database_url: Annotated[str, ...]) -> None:
        self._engine = get_engine(database_url)

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        async with AsyncSession(self._engine) as session:
            result = await session.execute(
                select(UserTable).where(UserTable.user_id == user_id)
            )
            db_user = result.scalar_one_or_none()
            if db_user is None:
                return None
            return self._to_domain(db_user)

    async def get_by_email(self, email: str) -> User | None:
        async with AsyncSession(self._engine) as session:
            result = await session.execute(
                select(UserTable).where(UserTable.email == email)
            )
            db_user = result.scalar_one_or_none()
            if db_user is None:
                return None
            return self._to_domain(db_user)

    async def update(self, user: User) -> User:
        async with AsyncSession(self._engine) as session:
            result = await session.execute(
                select(UserTable).where(UserTable.user_id == user.user_id)
            )
            db_user = result.scalar_one_or_none()
            if db_user is None:
                raise ValueError("User not found")

            db_user.role = user.role.value
            db_user.email = user.email
            db_user.full_name = user.full_name
            db_user.gov_id = user.gov_id
            db_user.is_active = user.is_active
            db_user.updated_at = datetime.now(timezone.utc)
            await session.commit()
            await session.refresh(db_user)
            return self._to_domain(db_user)

    async def list_users(self, skip: int = 0, limit: int = 10) -> list[User]:
        """Get paginated list of users"""
        async with AsyncSession(self._engine) as session:
            result = await session.execute(
                select(UserTable)
                .offset(skip)
                .limit(limit)
                .order_by(UserTable.created_at.desc())
            )
            db_users = result.scalars().all()
            return [self._to_domain(db_user) for db_user in db_users]

    async def count_users(self) -> int:
        """Get total count of users"""
        from sqlalchemy import func
        async with AsyncSession(self._engine) as session:
            result = await session.execute(select(func.count(UserTable.user_id)))
            return result.scalar() or 0

    def _to_domain(self, db_user: UserTable) -> User:
        return User(
            user_id=db_user.user_id,
            role=UserRole(db_user.role),
            email=db_user.email,
            full_name=db_user.full_name,
            gov_id=db_user.gov_id,
            created_at=db_user.created_at,
            is_active=db_user.is_active,
        )