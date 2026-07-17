"""Unit tests for the pre-diagnosis wizard — entity defaults, round-trip, and
the UpdatePreDiagnosisRequest input validator (SECURITY FIX #1).

Follows the pattern in tests/unit/test_entities.py (sync, direct import) and
tests/integration/test_routes.py (MagicMock + AsyncMock for repos).
"""

import uuid

import pytest
from pydantic import ValidationError


# ---- Entity defaults + round-trip ----------------------------------------


class TestProcessPreDiagnosisField:
    def test_pre_diagnosis_defaults_to_empty_dict(self):
        from src.domain.entities.process import Process

        p = Process(
            consultant_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            iso_standard="iso9001",
        )
        assert p.pre_diagnosis == {}
        assert isinstance(p.pre_diagnosis, dict)

    def test_pre_diagnosis_round_trips_arbitrary_dict(self):
        from src.domain.entities.process import Process

        answers = {
            "pd_employees": "11-50",
            "pd_sector": "Construcción",
            "pd_products": "Obras civiles",
            "pd_outsourcing": "Parcialmente",
        }
        p = Process(
            consultant_id=uuid.uuid4(),
            company_id=uuid.uuid4(),
            iso_standard="iso14001",
            pre_diagnosis=answers,
        )
        assert p.pre_diagnosis == answers

    def test_pre_diagnosis_is_independent_per_instance(self):
        """default_factory must produce a fresh dict per instance (no shared mutable default)."""
        from src.domain.entities.process import Process

        p1 = Process(consultant_id=uuid.uuid4(), company_id=uuid.uuid4(), iso_standard="iso9001")
        p2 = Process(consultant_id=uuid.uuid4(), company_id=uuid.uuid4(), iso_standard="iso9001")
        p1.pre_diagnosis["pd_x"] = "y"
        assert p2.pre_diagnosis == {}, "default dict was shared between instances"


# ---- UpdatePreDiagnosisRequest validator (SECURITY FIX #1) ---------------


class TestUpdatePreDiagnosisRequestValidator:
    def test_accepts_valid_answer_keys(self):
        from src.routes.processes.routes import UpdatePreDiagnosisRequest

        req = UpdatePreDiagnosisRequest(
            answers={
                "pd_employees": "11-50",
                "pd_sector": "Construcción",
                "pd_business_model": "B2B",
                "a": "x",
                "a_b_c_1_2": "y",
            }
        )
        assert req.answers["pd_employees"] == "11-50"

    def test_rejects_key_starting_with_digit(self):
        from src.routes.processes.routes import UpdatePreDiagnosisRequest

        with pytest.raises(ValidationError):
            UpdatePreDiagnosisRequest(answers={"1bad": "x"})

    def test_rejects_key_with_special_characters(self):
        from src.routes.processes.routes import UpdatePreDiagnosisRequest

        with pytest.raises(ValidationError):
            UpdatePreDiagnosisRequest(answers={"pd-sector": "x"})

    def test_rejects_key_that_is_too_long(self):
        from src.routes.processes.routes import UpdatePreDiagnosisRequest

        # 101 chars (a-z + underscores) — exceeds the {0,99} quantifier
        long_key = "a" + "_" * 100
        with pytest.raises(ValidationError):
            UpdatePreDiagnosisRequest(answers={long_key: "x"})

    def test_rejects_non_string_value(self):
        from src.routes.processes.routes import UpdatePreDiagnosisRequest

        with pytest.raises(ValidationError):
            UpdatePreDiagnosisRequest(answers={"pd_employees": 123})

    def test_rejects_value_over_2000_chars(self):
        from src.routes.processes.routes import UpdatePreDiagnosisRequest

        with pytest.raises(ValidationError):
            UpdatePreDiagnosisRequest(answers={"pd_sector": "x" * 2001})

    def test_accepts_value_exactly_2000_chars(self):
        from src.routes.processes.routes import UpdatePreDiagnosisRequest

        req = UpdatePreDiagnosisRequest(answers={"pd_sector": "x" * 2000})
        assert len(req.answers["pd_sector"]) == 2000

    def test_accepts_empty_answers(self):
        from src.routes.processes.routes import UpdatePreDiagnosisRequest

        req = UpdatePreDiagnosisRequest(answers={})
        assert req.answers == {}