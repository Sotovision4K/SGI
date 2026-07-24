"""SES email adapter (Port+Adapter). Fire-and-forget: errors are logged and
never raised to the caller, mirroring the llm_port → anthropic_adapter pattern.
"""

import hashlib
import html as html_escape
import logging

import boto3
from fastapi import Depends

from src.config.settings import Settings, get_settings
from .email_port import EmailPort

logger = logging.getLogger(__name__)


def _mask_email(email: str) -> str:
    """Return a truncated hash of an email address for safe logging."""
    return hashlib.sha256(email.encode()).hexdigest()[:12]


class SESAdapter(EmailPort):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = boto3.client(
            "ses", region_name=settings.aws_cognito_region
        )

    async def send_welcome_email(
        self, to: str, company_name: str, iso_standard: str
    ) -> None:
        if not self.settings.email_enabled:
            logger.info("Email disabled, skipping welcome email to %s", _mask_email(to))
            return

        safe_name = html_escape.escape(company_name)
        safe_iso = html_escape.escape(iso_standard)
        subject = f"Bienvenido a SGI Pro — {safe_name}"
        html = (
            f"<h2>¡Bienvenido a SGI Pro!</h2>"
            f"<p>Se ha iniciado el proceso de certificación para "
            f"<strong>{safe_name}</strong> bajo la norma "
            f"<strong>{safe_iso}</strong>.</p>"
            f"<p>Acceda a su panel para continuar el diagnóstico.</p>"
        )
        text_body = (
            f"Bienvenido a SGI Pro.\n\n"
            f"Se ha iniciado el proceso de certificacion para {company_name} "
            f"bajo la norma {iso_standard}.\n"
            f"Acceda a su panel para continuar el diagnostico."
        )

        try:
            self.client.send_email(
                Source=self.settings.ses_sender_email,
                Destination={"ToAddresses": [to]},
                Message={
                    "Subject": {"Data": subject},
                    "Body": {
                        "Text": {"Data": text_body},
                        "Html": {"Data": html},
                    },
                },
            )
            logger.info("Welcome email sent to %s for %s", _mask_email(to), company_name)
        except Exception as exc:  # noqa: BLE001 — fire-and-forget, never raise
            logger.error(
                "Failed to send welcome email to %s for %s: %s",
                _mask_email(to),
                company_name,
                exc,
            )


def get_email_adapter(settings: Settings = Depends(get_settings)) -> EmailPort:
    return SESAdapter(settings)