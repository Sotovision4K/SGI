from typing import Protocol, runtime_checkable
from uuid import UUID

from src.domain.entities.user import User


@runtime_checkable
class UserRepositoryPort(Protocol):
    async def get_by_id(self, user_id: UUID) -> User | None:
        ...

    async def get_by_email(self, email: str) -> User | None:
        ...

    async def update(self, user: User) -> User:
        ...

    async def list_users(self, skip: int = 0, limit: int = 10) -> list[User]:
        """List users with pagination"""
        ...

    async def count_users(self) -> int:
        """Count total number of users"""
        ...