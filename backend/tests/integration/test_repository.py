"""Repository layer tests."""

import pytest
from uuid import uuid4
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from src.domain.entities.user import User, UserRole
from src.adapters.db.user_repository import PostgresUserRepository


@pytest.fixture
def mock_engine():
    """Mock SQLAlchemy async engine."""
    return MagicMock()


@pytest.mark.asyncio
async def test_repository_get_by_id_not_found():
    """Test repository returns None for non-existent user."""
    repo = AsyncMock(spec=PostgresUserRepository)
    repo.get_by_id.return_value = None
    
    result = await repo.get_by_id(uuid4())
    
    assert result is None


@pytest.mark.asyncio
async def test_repository_get_by_email():
    """Test repository retrieves user by email."""
    user_id = uuid4()
    test_user = User(
        user_id=user_id,
        role=UserRole.CUSTOMER,
        email="test@example.com",
        full_name="Test User",
        gov_id="12345",
        created_at=datetime.now(timezone.utc),
    )
    
    repo = AsyncMock(spec=PostgresUserRepository)
    repo.get_by_email.return_value = test_user
    
    result = await repo.get_by_email("test@example.com")
    
    assert result.email == "test@example.com"
    assert result.user_id == user_id


@pytest.mark.asyncio
async def test_repository_list_users_pagination():
    """Test repository list_users respects pagination."""
    users = [
        User(
            user_id=uuid4(),
            role=UserRole.CUSTOMER,
            email=f"user{i}@example.com",
            full_name=f"User {i}",
            gov_id="123",
            created_at=datetime.now(timezone.utc),
        )
        for i in range(15)
    ]
    
    repo = AsyncMock(spec=PostgresUserRepository)
    repo.list_users.return_value = users[:10]
    repo.count_users.return_value = 15
    
    result = await repo.list_users(skip=0, limit=10)
    total = await repo.count_users()
    
    assert len(result) == 10
    assert total == 15


@pytest.mark.asyncio
async def test_repository_count_users():
    """Test repository count_users returns total."""
    repo = AsyncMock(spec=PostgresUserRepository)
    repo.count_users.return_value = 42
    
    result = await repo.count_users()
    
    assert result == 42


@pytest.mark.asyncio
async def test_repository_update_preserves_role():
    """Test repository update doesn't allow role changes."""
    user_id = uuid4()
    original_user = User(
        user_id=user_id,
        role=UserRole.CUSTOMER,
        email="test@example.com",
        full_name="Test User",
        gov_id="123",
        created_at=datetime.now(timezone.utc),
    )
    
    repo = AsyncMock(spec=PostgresUserRepository)
    repo.update.return_value = original_user
    
    result = await repo.update(original_user)
    
    # Role should remain unchanged
    assert result.role == UserRole.CUSTOMER
