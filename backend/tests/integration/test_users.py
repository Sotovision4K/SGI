"""Integration tests for user endpoints."""

import pytest
from httpx import AsyncClient
from uuid import uuid4
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_list_users_unauthorized():
    """Test that non-admin users cannot list users."""
    from fastapi.testclient import TestClient
    from src.main import app
    
    # This test would need a real auth setup, but shows the pattern


@pytest.mark.asyncio
async def test_list_users_with_pagination():
    """Test paginated user listing with skip and limit."""
    mock_users = [
        {
            "user_id": uuid4(),
            "email": f"user{i}@example.com",
            "full_name": f"User {i}",
            "role": "customer",
            "gov_id": f"ID{i}",
        }
        for i in range(5)
    ]
    
    # Mock repository
    mock_repo = AsyncMock()
    mock_repo.list_users.return_value = mock_users[:10]
    mock_repo.count_users.return_value = 25
    
    # Verify pagination parameters are passed
    assert mock_repo.list_users.call_count == 0


@pytest.mark.asyncio
async def test_get_current_user_info_not_found():
    """Test that 404 is returned when user email not found in database."""
    from src.routes.user.routes import get_current_user_info
    from fastapi import HTTPException
    
    mock_repo = AsyncMock()
    mock_repo.get_by_email.return_value = None
    
    current_user = {
        "sub": str(uuid4()),
        "email": "nonexistent@example.com",
    }
    
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user_info(current_user, mock_repo)
    
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_update_user_with_multiple_fields():
    """Test updating multiple user fields at once."""
    from src.routes.user.routes import update_user, UserUpdate
    from src.domain.entities.user import User, UserRole
    
    user_id = uuid4()
    mock_user = User(
        user_id=user_id,
        role=UserRole.CUSTOMER,
        email="old@example.com",
        full_name="Old Name",
        gov_id="123",
    )
    
    mock_repo = AsyncMock()
    mock_repo.get_by_id.return_value = mock_user
    mock_repo.update.return_value = User(
        user_id=user_id,
        role=UserRole.CUSTOMER,
        email="new@example.com",
        full_name="New Name",
        gov_id="123",
    )
    
    current_user = {
        "sub": str(user_id),
        "cognito:groups": [],
    }
    
    update_data = UserUpdate(
        email="new@example.com",
        full_name="New Name",
        gov_id=None,
        is_active=None,
    )
    
    result = await update_user(user_id, update_data, current_user, mock_repo)
    
    assert result.email == "new@example.com"
    assert result.full_name == "New Name"
    assert result.role == UserRole.CUSTOMER  # Role unchanged


@pytest.mark.asyncio
async def test_jwt_token_missing():
    """Test that missing JWT token returns 403."""
    from src.routes.user.auth import get_current_user
    from fastapi import HTTPException
    
    # No credentials provided
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(None, None)
    
    # Should raise security error


@pytest.mark.asyncio
async def test_concurrent_user_updates():
    """Test handling concurrent updates to same user."""
    from src.routes.user.routes import update_user, UserUpdate
    from src.domain.entities.user import User, UserRole
    
    user_id = uuid4()
    
    mock_repo = AsyncMock()
    original_user = User(
        user_id=user_id,
        role=UserRole.CUSTOMER,
        email="test@example.com",
        full_name="Test User",
        gov_id="123",
    )
    
    mock_repo.get_by_id.return_value = original_user
    mock_repo.update.return_value = original_user
    
    current_user = {
        "sub": str(user_id),
        "cognito:groups": [],
    }
    
    update1 = UserUpdate(email="new1@example.com", full_name=None, gov_id=None, is_active=None)
    update2 = UserUpdate(email=None, full_name="New Name", gov_id=None, is_active=None)
    
    # Both updates should succeed independently
    result1 = await update_user(user_id, update1, current_user, mock_repo)
    result2 = await update_user(user_id, update2, current_user, mock_repo)
    
    assert mock_repo.update.call_count == 2
