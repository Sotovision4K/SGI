"""Tests for the Lambda post sign-up trigger — CRITICAL-002.

The trigger must RAISE on DB failure so Cognito rejects the sign-up,
rather than swallowing the error and returning success.
"""

import os
from unittest.mock import patch, MagicMock

import pytest


def _make_event(email: str = "test@example.com", sub: str = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee") -> dict:
    """Return a Cognito PostConfirmation_ConfirmSignUp event matching the real trigger shape.
    
    Cognito sends 'sub' inside request.userAttributes as the unique user identifier.
    """
    return {
        "triggerSource": "PostConfirmation_ConfirmSignUp",
        "request": {
            "userAttributes": {
                "sub": sub,
                "email": email,
                "name": "Test User",
                "custom:govId": "123",
                "custom:role": "customer",
            },
        },
    }


class TestPostSignupTrigger:
    def test_db_error_raises_instead_of_returning_success(self):
        """CRITICAL-002: When DB insert fails, the trigger must raise, not return event."""
        from src.trigger.post_signup_trigger import handler

        event = _make_event()

        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://test:test@localhost/test"}):
            with patch("psycopg.connect") as mock_connect:
                mock_conn = MagicMock()
                mock_cur = MagicMock()
                mock_conn.__enter__.return_value = mock_conn
                mock_conn.cursor.return_value.__enter__.return_value = mock_cur
                mock_cur.execute.side_effect = Exception("Database connection refused")
                mock_connect.return_value = mock_conn

                with pytest.raises(RuntimeError, match="Post sign-up trigger failed"):
                    handler(event, {})

    def test_successful_insert_returns_event(self):
        """When DB insert succeeds, the handler should return the event normally."""
        from src.trigger.post_signup_trigger import handler

        event = _make_event()

        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://test:test@localhost/test"}):
            with patch("psycopg.connect") as mock_connect:
                mock_conn = MagicMock()
                mock_cur = MagicMock()
                mock_conn.__enter__.return_value = mock_conn
                mock_conn.cursor.return_value.__enter__.return_value = mock_cur
                mock_connect.return_value = mock_conn

                result = handler(event, {})
                assert result == event

    def test_psycopg_import_error_is_not_swallowed(self):
        """Any unexpected error should propagate, not be caught silently."""
        from src.trigger.post_signup_trigger import handler

        event = _make_event()

        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://test:test@localhost/test"}):
            with patch("psycopg.connect", side_effect=MemoryError("Out of memory")):
                with pytest.raises(RuntimeError):
                    handler(event, {})

    def test_non_signup_trigger_source_returns_event(self):
        """Non-confirmation triggers should pass through unchanged."""
        from src.trigger.post_signup_trigger import handler

        event = {"triggerSource": "PreSignUp_SignUp", "request": {}}

        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://test:test@localhost/test"}):
            result = handler(event, {})
            assert result == event
