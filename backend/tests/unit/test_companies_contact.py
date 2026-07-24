"""Tests for company contact fields on CreateCompanyRequest (Step 8, tests 1-5).

These are pure pydantic-validation tests — no DB, no network.
"""

import pytest
from pydantic import ValidationError


class TestCreateCompanyRequestContacts:
    def test_contact_name_is_required(self):
        """contact_name must be present (not optional)."""
        from src.routes.companies.routes import CreateCompanyRequest

        with pytest.raises(ValidationError) as exc_info:
            CreateCompanyRequest(
                name="Acme",
                business_type="general",
                contact_email="info@acme.com",
                # contact_name omitted on purpose
            )
        assert "contact_name" in str(exc_info.value)

    def test_contact_email_must_be_valid_email(self):
        """contact_email is an EmailStr and must be a valid email format."""
        from src.routes.companies.routes import CreateCompanyRequest

        # Valid email is accepted
        req = CreateCompanyRequest(
            name="Acme",
            business_type="general",
            contact_name="Jane Doe",
            contact_email="jane@acme.com",
        )
        assert req.contact_email == "jane@acme.com"

    def test_contact_phone_can_be_none(self):
        """contact_phone is optional and defaults to None."""
        from src.routes.companies.routes import CreateCompanyRequest

        req = CreateCompanyRequest(
            name="Acme",
            business_type="general",
            contact_name="Jane Doe",
            contact_email="jane@acme.com",
        )
        assert req.contact_phone is None

    def test_contact_name_over_100_chars_rejected(self):
        """contact_name max_length=100; longer values raise ValidationError."""
        from src.routes.companies.routes import CreateCompanyRequest

        with pytest.raises(ValidationError):
            CreateCompanyRequest(
                name="Acme",
                business_type="general",
                contact_name="x" * 101,
                contact_email="jane@acme.com",
            )

    def test_contact_email_invalid_format_rejected(self):
        """An obviously invalid email string must fail EmailStr validation."""
        from src.routes.companies.routes import CreateCompanyRequest

        with pytest.raises(ValidationError):
            CreateCompanyRequest(
                name="Acme",
                business_type="general",
                contact_name="Jane Doe",
                contact_email="not-an-email",
            )