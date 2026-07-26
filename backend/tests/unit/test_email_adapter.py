"""Tests for the SES email adapter (Step 9, tests 15-17).

Mirrors the Port+Adapter pattern used by the LLM adapter (llm_port →
anthropic_adapter). Email is fire-and-forget: errors are logged and never
propagate to the caller.
"""

import logging
from unittest.mock import MagicMock, patch

import pytest


def _fake_settings(email_enabled: bool, sender: str = "no-reply@example.com"):
    s = MagicMock()
    s.aws_cognito_region = "us-east-1"
    s.email_enabled = email_enabled
    s.ses_sender_email = sender
    return s


class TestSESAdapter:
    @pytest.mark.asyncio
    async def test_email_disabled_skips_send(self, caplog):
        """email_enabled=False → boto3 ses.send_email must NOT be called."""
        with patch("src.adapters.email.ses_adapter.boto3") as mock_boto3:
            mock_client = MagicMock()
            mock_boto3.client.return_value = mock_client

            from src.adapters.email.ses_adapter import SESAdapter

            adapter = SESAdapter(_fake_settings(email_enabled=False))
            caplog.set_level(logging.INFO)
            await adapter.send_welcome_email(
                "info@acme.com", "Acme SA", "iso9001"
            )

            mock_client.send_email.assert_not_called()
            # A log line was emitted indicating the skip.
            assert any(
                "Email disabled" in r.message or "skipping" in r.message
                for r in caplog.records
            )

    @pytest.mark.asyncio
    async def test_email_enabled_calls_ses_send_email(self):
        """email_enabled=True → boto3 ses.send_email is called once."""
        with patch("src.adapters.email.ses_adapter.boto3") as mock_boto3:
            mock_client = MagicMock()
            mock_boto3.client.return_value = mock_client

            from src.adapters.email.ses_adapter import SESAdapter

            adapter = SESAdapter(
                _fake_settings(email_enabled=True, sender="welcome@sgi.pro")
            )
            await adapter.send_welcome_email("info@acme.com", "Acme SA", "iso9001")

            mock_client.send_email.assert_called_once()
            kwargs = mock_client.send_email.call_args.kwargs
            # Sender comes from settings.ses_sender_email.
            assert kwargs.get("Source") == "welcome@sgi.pro"
            # Recipient is wrapped in Destination.ToAddresses list.
            dest = kwargs.get("Destination", {})
            assert "info@acme.com" in dest.get("ToAddresses", [])

    @pytest.mark.asyncio
    async def test_boto3_error_logged_not_raised(self, caplog):
        """A boto3 failure must be logged but never propagate to the caller."""
        with patch("src.adapters.email.ses_adapter.boto3") as mock_boto3:
            mock_client = MagicMock()
            mock_boto3.client.return_value = mock_client
            mock_client.send_email.side_effect = RuntimeError("SES throttled")

            from src.adapters.email.ses_adapter import SESAdapter

            adapter = SESAdapter(_fake_settings(email_enabled=True))
            caplog.set_level(logging.ERROR)

            # Must NOT raise.
            await adapter.send_welcome_email(
                "info@acme.com", "Acme SA", "iso9001"
            )

            # The error must have been logged.
            assert any(
                "SES throttled" in r.message
                or r.levelno >= logging.ERROR
                and "welcome" in (r.message or "").lower()
                or any("SES throttled" in str(a) for a in (r.args or []))
                for r in caplog.records
            ), f"Expected a logged error, got: {[r.message for r in caplog.records]}"