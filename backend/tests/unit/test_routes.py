"""Unit tests for user routes."""

import pytest
from uuid import uuid4
from unittest.mock import AsyncMock
from fastapi import HTTPException
from src.routes.user import routes
from src.domain.entities.user import User, UserRole


@pytest.mark.asyncio
async def test_get_current_user_info():
    """Test retrieving current user info."""
    user_id = uuid4()
    mock_user = User(
        user_id=user_id,
        role=UserRole.CUSTOMER,
        email="test@example.com",
        full_name="Test User",
        gov_id="12345",
    )
    
    mock_repo = AsyncMock()
    mock_repo.get_by_email.return_value = mock_user
    
    current_user = {
        "sub": str(user_id),
        "email": "test@example.com",
    }
    
    result = await routes.get_current_user_info(current_user, mock_repo)
    
    assert result.email == "test@example.com"
    mock_repo.get_by_email.assert_called_once()


@pytest.mark.asyncio
async def test_get_user_unauthorized():
    """Test that users cannot access other users' data without admin role."""
    user_id_1 = uuid4()
    user_id_2 = uuid4()
    
    mock_repo = AsyncMock()
    
    current_user = {
        "sub": str(user_id_1),
        "cognito:groups": [],  # No admin role
    }
    
    with pytest.raises(HTTPException) as exc_info:
        await routes.get_user(user_id_2, current_user, mock_repo)
    
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_get_user_as_admin():
    """Test that admins can access any user's data."""
    user_id_1 = uuid4()
    user_id_2 = uuid4()
    
    mock_user = User(
        user_id=user_id_2,
        role=UserRole.CUSTOMER,
        email="other@example.com",
        full_name="Other User",
        gov_id="67890",
    )
    
    mock_repo = AsyncMock()
    mock_repo.get_by_id.return_value = mock_user
    
    current_user = {
        "sub": str(user_id_1),
        "cognito:groups": ["admin"],
    }
    
    result = await routes.get_user(user_id_2, current_user, mock_repo)
    
    assert result.email == "other@example.com"


@pytest.mark.asyncio
async def test_update_user_cannot_update_role():
    """Test that role field is ignored in user updates."""
    user_id = uuid4()
    
    mock_user = User(
        user_id=user_id,
        role=UserRole.CUSTOMER,
        email="test@example.com",
        full_name="Test User",
        gov_id="12345",
    )
    
    mock_repo = AsyncMock()
    mock_repo.get_by_id.return_value = mock_user
    mock_repo.update.return_value = mock_user
    
    current_user = {
        "sub": str(user_id),
        "cognito:groups": [],
    }
    
    from src.routes.user.routes import UserUpdate
    update_data = UserUpdate(
        email="newemail@example.com",
        full_name="Updated Name",
        gov_id=None,
        is_active=None,
    )
    
    result = await routes.update_user(user_id, update_data, current_user, mock_repo)
    
    # Verify role was not updated
    assert result.role == UserRole.CUSTOMER
