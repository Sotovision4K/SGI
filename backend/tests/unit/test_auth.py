"""Unit tests for user authentication."""

import pytest
from unittest.mock import Mock
from src.routes.user.auth import get_current_user
from fastapi import HTTPException


@pytest.mark.asyncio
async def test_get_current_user_with_valid_token():
    """Test that valid tokens are accepted."""
    mock_credentials = Mock()
    mock_credentials.credentials = "valid_token"
    
    mock_adapter = Mock()
    mock_adapter.verify_token.return_value = {
        "sub": "user123",
        "email": "test@example.com",
        "cognito:groups": [],
    }
    
    result = await get_current_user(mock_credentials, mock_adapter)
    
    assert result["sub"] == "user123"
    assert result["email"] == "test@example.com"


@pytest.mark.asyncio
async def test_get_current_user_with_expired_token():
    """Test that expired tokens are rejected."""
    from jwt import ExpiredSignatureError
    
    mock_credentials = Mock()
    mock_credentials.credentials = "expired_token"
    
    mock_adapter = Mock()
    mock_adapter.verify_token.side_effect = ExpiredSignatureError("Token expired")
    
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(mock_credentials, mock_adapter)
    
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_with_invalid_token():
    """Test that invalid tokens are rejected."""
    from jwt import InvalidTokenError
    
    mock_credentials = Mock()
    mock_credentials.credentials = "invalid_token"
    
    mock_adapter = Mock()
    mock_adapter.verify_token.side_effect = InvalidTokenError("Invalid token")
    
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(mock_credentials, mock_adapter)
    
    assert exc_info.value.status_code == 401
