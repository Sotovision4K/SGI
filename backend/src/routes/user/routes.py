from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, EmailStr, Field

from src.domain.entities.user import User
from src.domain.repositories.user_repository import UserRepositoryPort
from src.adapters.db.user_repository import PostgresUserRepository
from src.config.settings import SettingsDep
from src.routes.user.auth import CurrentUserDep


router = APIRouter(prefix="/users", tags=["users"])


def get_user_repository(settings: SettingsDep) -> UserRepositoryPort:
    return PostgresUserRepository(settings.database_url)


UserRepositoryDep = Annotated[UserRepositoryPort, Depends(get_user_repository)]


class UserUpdate(BaseModel):
    """User update model - role is intentionally excluded to prevent privilege escalation"""
    email: EmailStr | None = Field(default=None, max_length=255)
    full_name: str | None = Field(default=None, max_length=100)
    gov_id: str | None = Field(default=None, max_length=20)
    is_active: bool | None = None
    # NOTE: role field is NOT included - users cannot update their own role


class UserListResponse(BaseModel):
    """Paginated user list response"""
    items: list[User]
    total: int = Field(description="Total number of users")
    skip: int = Field(description="Number of records skipped")
    limit: int = Field(description="Number of records returned")


@router.get("/me", response_model=User)
async def get_current_user_info(
    current_user: CurrentUserDep,
    user_repo: UserRepositoryDep,
) -> User:
    email = current_user.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email not found in token",
        )

    user = await user_repo.get_by_email(email)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


@router.get("", response_model=UserListResponse)
async def list_users(
    current_user: CurrentUserDep,
    user_repo: UserRepositoryDep,
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(10, ge=1, le=100, description="Number of records to return (max 100)"),
) -> UserListResponse:
    """List all users with pagination - admin only"""
    # Only admins can list all users
    if "admin" not in (current_user.get("cognito:groups") or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can list users",
        )
    
    # Get paginated results and total count
    users = await user_repo.list_users(skip=skip, limit=limit)
    total = await user_repo.count_users()
    
    return UserListResponse(
        items=users,
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get("/{user_id}", response_model=User)
async def get_user(
    user_id: UUID,
    current_user: CurrentUserDep,
    user_repo: UserRepositoryDep,
) -> User:
    """Get user by ID - only users can view themselves, admins can view anyone"""
    # Authorization check: user can only view their own data unless they are admin
    groups = current_user.get("cognito:groups") or []
    is_self = user_id == UUID(current_user.get("sub", ""))
    if not is_self and "admin" not in groups:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this user's data",
        )
    
    user = await user_repo.get_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


@router.patch("/{user_id}", response_model=User)
async def update_user(
    user_id: UUID,
    user_data: UserUpdate,
    current_user: CurrentUserDep,
    user_repo: UserRepositoryDep,
) -> User:
    """Update user by ID - only users can update themselves, admins can update anyone"""
    # Authorization check: user can only update their own data unless they are admin
    groups = current_user.get("cognito:groups") or []
    is_self = user_id == UUID(current_user.get("sub", ""))
    if not is_self and "admin" not in groups:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this user's data",
        )
    
    user = await user_repo.get_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if user_data.email is not None:
        user.email = user_data.email
    if user_data.full_name is not None:
        user.full_name = user_data.full_name
    if user_data.gov_id is not None:
        user.gov_id = user_data.gov_id
    if user_data.is_active is not None:
        user.is_active = user_data.is_active

    updated_user = await user_repo.update(user)
    return updated_user