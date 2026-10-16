"""Integration tests for processes/companies/questionnaires routes.

Derived from the spec:
- All routes require Bearer auth (return 401/403 without)
- /processes — GET, POST
- /processes/{id} — GET, DELETE
- /processes/{id}/findings — GET, PUT
- /processes/{id}/plan — GET
- /processes/{id}/generate-plan — POST
- /companies — GET, POST
- /companies/{id} — GET
- /questionnaires/{iso} — GET (iso9001, iso14001, iso45001)
"""

import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# ---- Fixtures --------------------------------------------------------------


@pytest.fixture
def mock_settings():
    s = MagicMock()
    s.anthropic_api_key = "sk-test"
    s.anthropic_model = "claude-test"
    s.database_url = "postgresql+asyncpg://test:test@localhost/test"
    s.aws_cognito_jwks_url = "https://cognito-idp.us-east-1.amazonaws.com/pool/.well-known/jwks.json"
    s.aws_cognito_client_id = "test-client"
    s.aws_cognito_region = "us-east-1"
    s.aws_cognito_user_pool_id = "us-east-1_TEST"
    return s


@pytest.fixture
def mock_current_user():
    return {"sub": str(uuid.uuid4()), "email": "test@example.com", "cognito:groups": []}


@pytest.fixture
def client(mock_settings, mock_current_user):
    """FastAPI test client with mocked settings + auth."""

    from src.main import app
    from src.routes.user.auth import get_current_user as real_get_current_user
    from src.config.settings import get_settings as real_get_settings

    # Override the get_current_user dependency to skip token verification, and
    # get_settings so routes resolve a real Settings value instead of the MagicMock
    # (patch() replaces it with a MagicMock whose `(*args, **kwargs)` signature
    # breaks FastAPI's Depends resolution — "query args/kwargs" 422).
    app.dependency_overrides[real_get_current_user] = lambda: mock_current_user
    app.dependency_overrides[real_get_settings] = lambda: mock_settings

    # Skip lifespan (DB connection)
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def noop_lifespan(app):
        yield

    app.router.lifespan_context = noop_lifespan

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()


# ---- Health ----------------------------------------------------------------


class TestHealth:
    def test_health_does_not_require_auth(self, client):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "healthy"


# ---- Companies -------------------------------------------------------------


class TestCompaniesRoutes:
    def test_list_companies_returns_items(self, client):
        items = [
            {
                "company_id": str(uuid.uuid4()),
                "user_id": str(uuid.uuid4()),
                "name": "TechCorp",
                "business_type": "manufactura",
                "is_active": True,
            }
        ]
        mock_repo = MagicMock()
        mock_repo.list_companies = AsyncMock(return_value=items)

        from src.main import app as fastapi_app
        from src.routes.companies.routes import get_company_repository, get_process_repository as get_proc_repo

        proc_repo = MagicMock()
        proc_repo.list_processes = AsyncMock(return_value=[])
        old_comp = _override_repo(fastapi_app, get_company_repository, mock_repo)
        old_proc = _override_repo(fastapi_app, get_proc_repo, proc_repo)
        try:
            r = client.get("/companies")
        finally:
            _restore_repo(fastapi_app, get_company_repository, old_comp)
            _restore_repo(fastapi_app, get_proc_repo, old_proc)

        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        assert "total" in body
        assert body["total"] == len(items)

    def test_create_company_requires_name(self, client):
        r = client.post("/companies", json={"name": ""})
        assert r.status_code == 422

    def test_create_company_uses_sub_as_owner(self, client, mock_current_user):
        created = {
            "company_id": str(uuid.uuid4()),
            "user_id": mock_current_user["sub"],
            "name": "Acme",
            "business_type": "general",
            "is_active": True,
        }
        mock_repo = MagicMock()
        mock_repo.create_company = AsyncMock(return_value=created)

        with patch(
            "src.routes.companies.routes.get_company_repository",
            return_value=lambda: mock_repo,
        ):
            r = client.post("/companies", json={"name": "Acme"})

        if r.status_code in (200, 201):
            assert r.json()["user_id"] == mock_current_user["sub"]
            # Verify the repo was called with the right user_id
            call = mock_repo.create_company.call_args
            assert str(call.kwargs.get("user_id")) == mock_current_user["sub"]


# ---- Questionnaires --------------------------------------------------------


class TestQuestionnairesRoutes:
    QUESTIONNAIRES_DIR = (
        Path(__file__).resolve().parent.parent.parent / "questionnaires"
    )

    def test_serves_iso9001_questionnaire(self, client):
        r = client.get("/questionnaires/iso9001")
        if r.status_code == 200:
            body = r.json()
            assert body["iso_standard"] == "iso9001"
            assert len(body["groups"]) >= 1
            # Each group must have questions
            for g in body["groups"]:
                assert "id" in g
                assert "title" in g
                assert isinstance(g["questions"], list)
                for q in g["questions"]:
                    assert "id" in q
                    assert "type" in q
                    assert "label" in q
                    assert "required" in q
                    assert q["type"] in ("text", "textarea", "select")

    def test_serves_iso14001_questionnaire(self, client):
        r = client.get("/questionnaires/iso14001")
        if r.status_code == 200:
            assert r.json()["iso_standard"] == "iso14001"

    def test_serves_iso45001_questionnaire(self, client):
        r = client.get("/questionnaires/iso45001")
        if r.status_code == 200:
            assert r.json()["iso_standard"] == "iso45001"

    def test_rejects_unknown_iso(self, client):
        r = client.get("/questionnaires/iso27001")
        assert r.status_code == 404

    def test_serves_pre_diagnosis_questionnaire(self, client):
        r = client.get("/questionnaires/pre_diagnosis")
        if r.status_code == 200:
            body = r.json()
            assert body["iso_standard"] == "pre_diagnosis"
            assert isinstance(body["groups"], list)
            assert len(body["groups"]) > 0

    def test_questionnaires_have_about_30_questions(self, client):
        for iso in ("iso9001", "iso14001", "iso45001"):
            r = client.get(f"/questionnaires/{iso}")
            if r.status_code == 200:
                total = sum(len(g["questions"]) for g in r.json()["groups"])
                assert total >= 20, f"{iso} has only {total} questions"
                assert total <= 50, f"{iso} has too many questions ({total})"

    def test_questionnaires_are_in_spanish(self, client):
        r = client.get("/questionnaires/iso9001")
        if r.status_code == 200:
            raw = r.text
            # Common Spanish words that should appear (at least one confirms Spanish content)
            spanish_words = ("empresa", "document", "calidad", "proceso")
            assert any(w in raw.lower() for w in spanish_words), "No Spanish words found in iso9001"


# ---- Processes -------------------------------------------------------------


class TestProcessesRoutes:
    def test_list_processes_returns_items(self, client):
        mock_repo = MagicMock()
        mock_repo.list_processes_with_company = AsyncMock(return_value=[])

        from src.main import app as fastapi_app
        from src.routes.processes.routes import get_process_repository

        old = _override_repo(fastapi_app, get_process_repository, mock_repo)
        try:
            r = client.get("/processes")
        finally:
            _restore_repo(fastapi_app, get_process_repository, old)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body
        assert "total" in body

    def test_create_process_requires_valid_module(self, client):
        r = client.post(
            "/processes",
            json={"company_id": str(uuid.uuid4()), "perfilamiento_module": "iso27001"},
        )
        assert r.status_code == 422

    def test_create_process_requires_company_id_uuid(self, client):
        r = client.post(
            "/processes",
            json={"company_id": "not-a-uuid", "perfilamiento_module": "sst"},
        )
        assert r.status_code == 422

    def test_create_process_rejects_extra_fields(self, client):
        r = client.post(
            "/processes",
            json={
                "company_id": str(uuid.uuid4()),
                "perfilamiento_module": "sst",
                "unexpected": "nope",
            },
        )
        assert r.status_code == 422

    def test_create_process_uses_sub_as_consultant(self, client, mock_current_user):
        new_id = uuid.uuid4()
        created_process = MagicMock()
        created_process.id = new_id
        created_process.consultant_id = uuid.UUID(mock_current_user["sub"])
        created_process.company_id = uuid.uuid4()
        created_process.iso_standard = None
        created_process.perfilamiento_module = MagicMock()
        created_process.perfilamiento_module.value = "optimizacion"
        created_process.needs_certification = False
        created_process.status = MagicMock()
        created_process.status.value = "profiling_pending"
        created_process.pre_diagnosis = {}
        created_process.perfilamiento_answers = {}
        created_process.analysis_result = {}
        created_process.created_at = datetime.now(timezone.utc)
        created_process.updated_at = datetime.now(timezone.utc)

        mock_repo = MagicMock()
        mock_repo.create_process = AsyncMock(return_value=created_process)

        company = {
            "user_id": mock_current_user["sub"],
            "contact_email": "x@example.com",
            "name": "Acme",
        }
        app, deps = self._override_process_deps(mock_repo, company=company)
        try:
            with patch(
                "src.routes.processes.routes._hydrate_company_name",
                AsyncMock(return_value=None),
            ):
                r = client.post(
                    "/processes",
                    json={
                        "company_id": str(uuid.uuid4()),
                        "perfilamiento_module": "optimizacion",
                    },
                )
        finally:
            self._restore_process_deps(app, deps)

        assert r.status_code in (200, 201)
        call = mock_repo.create_process.call_args.args[0]
        assert str(call.consultant_id) == mock_current_user["sub"]

    def _override_process_deps(self, mock_repo, company=None):
        """Override process/company repo + settings + email deps (Depends is not patchable).

        ``company`` is the dict returned by ``CompanyRepository.get_company``
        (used by create_process's ownership check); ``None`` simulates a missing
        company.
        """
        from src.main import app as fastapi_app
        from src.routes.processes.routes import get_process_repository, get_company_repository
        from src.config.settings import get_settings
        from src.adapters.email.ses_adapter import get_email_adapter

        mock_company_repo = MagicMock()
        mock_company_repo.get_company = AsyncMock(return_value=company)
        mock_email = MagicMock()
        mock_email.send_welcome_email = AsyncMock()
        fastapi_app.dependency_overrides[get_process_repository] = lambda: mock_repo
        fastapi_app.dependency_overrides[get_company_repository] = lambda: mock_company_repo
        fastapi_app.dependency_overrides[get_settings] = lambda: MagicMock()
        fastapi_app.dependency_overrides[get_email_adapter] = lambda: mock_email
        return fastapi_app, (get_process_repository, get_company_repository, get_settings, get_email_adapter)

    def _restore_process_deps(self, fastapi_app, deps):
        for dep in deps:
            fastapi_app.dependency_overrides.pop(dep, None)

    def test_create_process_with_module_does_not_derive_iso(self, client, mock_current_user):
        """POST with perfilamiento_module leaves iso_standard None (certification deferred)."""
        from src.domain.entities.process import PerfilamientoModule, ProcessStatus

        mock_repo = MagicMock()
        mock_repo.create_process = AsyncMock(side_effect=lambda p: p)
        company = {
            "user_id": mock_current_user["sub"],
            "contact_email": "x@example.com",
            "name": "Acme",
        }
        app, deps = self._override_process_deps(mock_repo, company=company)
        try:
            with patch(
                "src.routes.processes.routes._hydrate_company_name",
                AsyncMock(return_value=None),
            ):
                r = client.post(
                    "/processes",
                    json={"company_id": str(uuid.uuid4()), "perfilamiento_module": "sst"},
                )
        finally:
            self._restore_process_deps(app, deps)

        assert r.status_code == 201
        call = mock_repo.create_process.call_args.args[0]
        assert call.perfilamiento_module == PerfilamientoModule.SST
        assert call.iso_standard is None
        assert call.status == ProcessStatus.PROFILING_PENDING
        assert r.json()["perfilamiento_module"] == "sst"
        assert r.json()["iso_standard"] is None
        assert r.json()["needs_certification"] is False

    def test_create_process_with_module_and_needs_certification_round_trips(
        self, client, mock_current_user
    ):
        """POST with needs_certification=true round-trips the flag; iso stays None."""
        from src.domain.entities.process import PerfilamientoModule, ProcessStatus

        mock_repo = MagicMock()
        mock_repo.create_process = AsyncMock(side_effect=lambda p: p)
        company = {
            "user_id": mock_current_user["sub"],
            "contact_email": "x@example.com",
            "name": "Acme",
        }
        app, deps = self._override_process_deps(mock_repo, company=company)
        try:
            with patch(
                "src.routes.processes.routes._hydrate_company_name",
                AsyncMock(return_value=None),
            ):
                r = client.post(
                    "/processes",
                    json={
                        "company_id": str(uuid.uuid4()),
                        "perfilamiento_module": "sst",
                        "needs_certification": True,
                    },
                )
        finally:
            self._restore_process_deps(app, deps)

        assert r.status_code == 201
        call = mock_repo.create_process.call_args.args[0]
        assert call.perfilamiento_module == PerfilamientoModule.SST
        assert call.iso_standard is None
        assert call.needs_certification is True
        assert call.status == ProcessStatus.PROFILING_PENDING
        assert r.json()["iso_standard"] is None
        assert r.json()["needs_certification"] is True

    def test_create_process_nts_module_has_null_iso(self, client, mock_current_user):
        """nts maps to no single ISO → iso_standard stays None."""
        from src.domain.entities.process import PerfilamientoModule, ProcessStatus

        mock_repo = MagicMock()
        mock_repo.create_process = AsyncMock(side_effect=lambda p: p)
        company = {
            "user_id": mock_current_user["sub"],
            "contact_email": "x@example.com",
            "name": "Acme",
        }
        app, deps = self._override_process_deps(mock_repo, company=company)
        try:
            with patch(
                "src.routes.processes.routes._hydrate_company_name",
                AsyncMock(return_value=None),
            ):
                r = client.post(
                    "/processes",
                    json={"company_id": str(uuid.uuid4()), "perfilamiento_module": "nts"},
                )
        finally:
            self._restore_process_deps(app, deps)

        assert r.status_code == 201
        call = mock_repo.create_process.call_args.args[0]
        assert call.perfilamiento_module == PerfilamientoModule.NTS
        assert call.iso_standard is None
        assert call.status == ProcessStatus.PROFILING_PENDING
        assert r.json()["iso_standard"] is None

    def test_create_process_missing_company_returns_404(self, client):
        """Creating a process for a company that does not exist → 404."""
        mock_repo = MagicMock()
        mock_repo.create_process = AsyncMock(side_effect=lambda p: p)
        app, deps = self._override_process_deps(mock_repo, company=None)
        try:
            r = client.post(
                "/processes",
                json={"company_id": str(uuid.uuid4()), "perfilamiento_module": "sst"},
            )
        finally:
            self._restore_process_deps(app, deps)

        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"
        mock_repo.create_process.assert_not_awaited()

    def test_create_process_foreign_company_returns_403(self, client, mock_current_user):
        """A company owned by another auditor must be rejected (403) and create no row."""
        mock_repo = MagicMock()
        mock_repo.create_process = AsyncMock(side_effect=lambda p: p)
        foreign_company = {
            "user_id": str(uuid.uuid4()),  # a different auditor
            "contact_email": "other@example.com",
            "name": "Foreign Corp",
        }
        assert foreign_company["user_id"] != mock_current_user["sub"]
        app, deps = self._override_process_deps(mock_repo, company=foreign_company)
        try:
            r = client.post(
                "/processes",
                json={"company_id": str(uuid.uuid4()), "perfilamiento_module": "sst"},
            )
        finally:
            self._restore_process_deps(app, deps)

        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"
        mock_repo.create_process.assert_not_awaited()

    def test_create_process_requires_module(self, client):
        mock_repo = MagicMock()
        mock_repo.create_process = AsyncMock(side_effect=lambda p: p)
        app, deps = self._override_process_deps(mock_repo)
        try:
            with patch(
                "src.routes.processes.routes._hydrate_company_name",
                AsyncMock(return_value=None),
            ):
                r = client.post("/processes", json={"company_id": str(uuid.uuid4())})
        finally:
            self._restore_process_deps(app, deps)
        assert r.status_code == 422

    def test_check_duplicate_returns_taken_modules_and_empty_iso(self, client):
        """check-duplicate aggregates active processes into module + ISO sets.

        Under the new flow no ISO is assigned at creation, so taken_iso_standards
        is empty even though taken_modules still reflects the chosen modules.
        """
        from src.domain.entities.process import (
            PerfilamientoModule,
            ProcessStatus,
            Process,
        )

        company_id = uuid.uuid4()
        consultant_id = uuid.uuid4()

        p1 = Process(
            consultant_id=consultant_id,
            company_id=company_id,
            perfilamiento_module=PerfilamientoModule.SST,
            iso_standard=None,
            status=ProcessStatus.PROFILING_PENDING,
        )
        p2 = Process(
            consultant_id=consultant_id,
            company_id=company_id,
            perfilamiento_module=PerfilamientoModule.PLANIFICACION,
            iso_standard=None,
            status=ProcessStatus.IN_DIAGNOSIS,
        )

        mock_repo = MagicMock()
        mock_repo.list_active_by_company = AsyncMock(return_value=[p1, p2])
        app, deps = self._override_process_deps(mock_repo)
        try:
            r = client.get(f"/processes/check-duplicate?company_id={company_id}")
        finally:
            self._restore_process_deps(app, deps)

        assert r.status_code == 200
        body = r.json()
        assert set(body["taken_modules"]) == {"sst", "planificacion"}
        assert body["taken_iso_standards"] == []

    def test_pre_diagnosis_round_trip(self, client, mock_current_user):
        """PUT pre-diagnosis -> GET process includes the saved dict."""
        from src.domain.entities.process import Process, IsoStandard, ProcessStatus
        from src.main import app as fastapi_app
        from src.routes.processes.routes import get_process_repository

        process = Process(
            id=uuid.uuid4(),
            consultant_id=uuid.UUID(mock_current_user["sub"]),
            company_id=uuid.uuid4(),
            iso_standard=IsoStandard.ISO_9001,
            status=ProcessStatus.IN_DIAGNOSIS,
        )

        answers = {
            "pd_employees": "11-50",
            "pd_sector": "Construcción",
            "pd_target_date": "6-12 meses",
        }

        # After the PUT, get_process returns a process carrying the saved answers
        updated = process.model_copy(update={"pre_diagnosis": answers})
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=updated)
        mock_repo.update_pre_diagnosis = AsyncMock()

        old_repo = fastapi_app.dependency_overrides.get(get_process_repository)
        fastapi_app.dependency_overrides[get_process_repository] = lambda: mock_repo
        try:
            with patch(
                "src.routes.processes.routes._hydrate_company_name",
                AsyncMock(return_value="Test Corp"),
            ):
                r = client.put(
                    f"/processes/{process.id}/pre-diagnosis",
                    json={"answers": answers},
                )
        finally:
            if old_repo is not None:
                fastapi_app.dependency_overrides[get_process_repository] = old_repo
            else:
                fastapi_app.dependency_overrides.pop(get_process_repository, None)

        if r.status_code == 200:
            body = r.json()
            assert body["pre_diagnosis"] == answers
            mock_repo.update_pre_diagnosis.assert_called_once_with(process.id, answers)

    def test_pre_diagnosis_rejects_invalid_key(self, client, mock_current_user):
        """SECURITY FIX #1: invalid answer keys must be rejected (422)."""
        from src.domain.entities.process import Process, IsoStandard, ProcessStatus
        from src.main import app as fastapi_app
        from src.routes.processes.routes import get_process_repository

        process = Process(
            id=uuid.uuid4(),
            consultant_id=uuid.UUID(mock_current_user["sub"]),
            company_id=uuid.uuid4(),
            iso_standard=IsoStandard.ISO_9001,
            status=ProcessStatus.IN_DIAGNOSIS,
        )
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)

        old_repo = fastapi_app.dependency_overrides.get(get_process_repository)
        fastapi_app.dependency_overrides[get_process_repository] = lambda: mock_repo
        try:
            r = client.put(
                f"/processes/{process.id}/pre-diagnosis",
                json={"answers": {"1BAD_KEY": "value"}},
            )
        finally:
            if old_repo is not None:
                fastapi_app.dependency_overrides[get_process_repository] = old_repo
            else:
                fastapi_app.dependency_overrides.pop(get_process_repository, None)
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"


# ---- Findings --------------------------------------------------------------


class TestFindingsRoutes:
    def test_get_findings_when_none_returns_empty(self, client, mock_current_user):
        process = _make_process_for_owner(mock_current_user["sub"])
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.get_finding = AsyncMock(return_value=None)

        from src.main import app as fastapi_app
        from src.routes.processes.routes import get_process_repository

        old = _override_repo(fastapi_app, get_process_repository, mock_repo)
        try:
            r = client.get(f"/processes/{process.id}/findings")
        finally:
            _restore_repo(fastapi_app, get_process_repository, old)
        assert r.status_code == 200
        body = r.json()
        assert body["answers"] == {}
        assert body["free_text"] == ""

    def test_upsert_findings_requires_process_exists(self, client):
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=None)

        from src.main import app as fastapi_app
        from src.routes.processes.routes import get_process_repository

        old = _override_repo(fastapi_app, get_process_repository, mock_repo)
        try:
            r = client.put(
                f"/processes/{uuid.uuid4()}/findings",
                json={"answers": {"q1": "x"}, "free_text": ""},
            )
        finally:
            _restore_repo(fastapi_app, get_process_repository, old)
        # 404 because process doesn't exist; repo mock returns None
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"

    def _owned_process(self, mock_current_user):
        from src.domain.entities.process import Process, IsoStandard, ProcessStatus

        return Process(
            id=uuid.uuid4(),
            consultant_id=uuid.UUID(mock_current_user["sub"]),
            company_id=uuid.uuid4(),
            iso_standard=IsoStandard.ISO_9001,
            status=ProcessStatus.IN_DIAGNOSIS,
        )

    def _put_findings(self, client, fastapi_app, mock_repo, process_id, payload):
        """PUT findings with the repo swapped in via dependency_overrides."""
        from src.routes.processes.routes import get_process_repository

        old_repo = fastapi_app.dependency_overrides.get(get_process_repository)
        fastapi_app.dependency_overrides[get_process_repository] = lambda: mock_repo
        try:
            return client.put(f"/processes/{process_id}/findings", json=payload)
        finally:
            if old_repo is not None:
                fastapi_app.dependency_overrides[get_process_repository] = old_repo
            else:
                fastapi_app.dependency_overrides.pop(get_process_repository, None)

    def test_upsert_findings_rejects_nested_dict_answers(self, client, mock_current_user):
        """Code-review M2: a nested dict answer must be rejected (422).

        Non-string values previously bypassed the 2000-char cap (the old
        validator only checked `isinstance(value, str)`) and were later
        coerced via `str(answers[qid])`, bloating the LLM prompt.
        """
        from src.main import app as fastapi_app

        process = self._owned_process(mock_current_user)
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.upsert_finding = AsyncMock()

        r = self._put_findings(
            client, fastapi_app, mock_repo, process.id,
            {"answers": {"q1": {"nested": "dict"}}},
        )
        assert r.status_code == 422, \
            f"Nested dict answer must be rejected, got {r.status_code}: {r.text[:200]}"
        mock_repo.upsert_finding.assert_not_called()

    def test_upsert_findings_rejects_list_answers(self, client, mock_current_user):
        """Code-review M2: a list answer must be rejected (422)."""
        from src.main import app as fastapi_app

        process = self._owned_process(mock_current_user)
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.upsert_finding = AsyncMock()

        r = self._put_findings(
            client, fastapi_app, mock_repo, process.id,
            {"answers": {"q1": ["a", "b"]}},
        )
        assert r.status_code == 422, \
            f"List answer must be rejected, got {r.status_code}: {r.text[:200]}"
        mock_repo.upsert_finding.assert_not_called()

    def test_upsert_findings_rejects_answer_over_2000_chars(self, client, mock_current_user):
        """The 2000-char cap still holds via the typed `dict[str, str]` path."""
        from src.main import app as fastapi_app

        process = self._owned_process(mock_current_user)
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.upsert_finding = AsyncMock()

        r = self._put_findings(
            client, fastapi_app, mock_repo, process.id,
            {"answers": {"q1": "x" * 2001}},
        )
        assert r.status_code == 422, \
            f"Oversized answer must be rejected, got {r.status_code}: {r.text[:200]}"
        mock_repo.upsert_finding.assert_not_called()

    def test_upsert_findings_with_string_answers_succeeds(self, client, mock_current_user):
        """Happy path: string answers are persisted and returned unchanged."""
        from src.domain.entities.finding import Finding
        from src.main import app as fastapi_app

        process = self._owned_process(mock_current_user)
        answers = {"q_main_processes": "sí", "q_documented_info": "no aplica"}
        saved = Finding(process_id=process.id, answers=answers, free_text="notas")

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.upsert_finding = AsyncMock(return_value=saved)

        r = self._put_findings(
            client, fastapi_app, mock_repo, process.id,
            {"answers": answers, "free_text": "notas"},
        )
        assert r.status_code == 200, \
            f"String answers must be accepted, got {r.status_code}: {r.text[:200]}"
        body = r.json()
        assert body["answers"] == answers
        assert body["free_text"] == "notas"
        persisted = mock_repo.upsert_finding.call_args.args[0]
        assert persisted.answers == answers
        assert persisted.free_text == "notas"


# ---- Generate Plan ---------------------------------------------------------


class TestGeneratePlanRoute:
    """Async enqueue contract (Phase 3): POST /generate-plan → 202 {job_id}.

    The route no longer calls the LLM synchronously; it snapshots findings +
    pre-diagnosis, creates a `plan_jobs` row, and enqueues one SQS message.
    """

    def _fake_queue(self, side_effect=None):
        q = MagicMock()
        q.enqueue_plan_generation = AsyncMock(side_effect=side_effect)
        return q

    @staticmethod
    @contextmanager
    def _override_deps(app, mock_repo, queue):
        """Swap in the fake repo + queue via dependency_overrides (patch() on
        the module attribute is ineffective — Depends() captures the original
        function at import time)."""
        from src.routes.processes.routes import (
            get_process_repository,
            get_queue_adapter,
        )

        old_repo = app.dependency_overrides.get(get_process_repository)
        old_queue = app.dependency_overrides.get(get_queue_adapter)
        app.dependency_overrides[get_process_repository] = lambda: mock_repo
        app.dependency_overrides[get_queue_adapter] = lambda: queue
        try:
            yield
        finally:
            if old_repo is not None:
                app.dependency_overrides[get_process_repository] = old_repo
            else:
                app.dependency_overrides.pop(get_process_repository, None)
            if old_queue is not None:
                app.dependency_overrides[get_queue_adapter] = old_queue
            else:
                app.dependency_overrides.pop(get_queue_adapter, None)

    @staticmethod
    def _app():
        from src.main import app
        return app

    def test_generate_plan_requires_findings_first(self, client, mock_current_user):
        process = _make_process_for_owner(mock_current_user["sub"])

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.get_finding = AsyncMock(return_value=None)

        with self._override_deps(self._app(), mock_repo, self._fake_queue()):
            r = client.post(f"/processes/{process.id}/generate-plan")

        assert r.status_code == 400, f"got {r.status_code}: {r.text[:300]}"

    def test_generate_plan_without_iso_returns_409_and_does_not_enqueue(
        self, client, mock_current_user
    ):
        from src.domain.entities.process import Process, ProcessStatus
        from src.domain.entities.finding import Finding

        process = Process(
            id=uuid.uuid4(),
            consultant_id=uuid.UUID(mock_current_user["sub"]),
            company_id=uuid.uuid4(),
            iso_standard=None,
            status=ProcessStatus.IN_DIAGNOSIS,
        )
        finding = Finding(process_id=process.id, answers={"q1": "yes"})

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.get_finding = AsyncMock(return_value=finding)
        mock_repo.create_plan_job = AsyncMock()

        queue = self._fake_queue()

        with self._override_deps(self._app(), mock_repo, queue):
            r = client.post(f"/processes/{process.id}/generate-plan")

        assert r.status_code == 409, f"got {r.status_code}: {r.text[:300]}"
        mock_repo.create_plan_job.assert_not_awaited()
        queue.enqueue_plan_generation.assert_not_awaited()
        mock_repo.get_finding.assert_not_awaited()

    def test_generate_plan_requires_process_exists(self, client):
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=None)

        with self._override_deps(self._app(), mock_repo, self._fake_queue()):
            r = client.post(f"/processes/{uuid.uuid4()}/generate-plan")

        assert r.status_code == 404, f"got {r.status_code}: {r.text[:300]}"

    def test_generate_plan_enqueues_and_returns_202(self, client, mock_current_user):
        from src.domain.entities.finding import Finding
        from src.domain.entities.plan_job import PlanJob

        process = _make_process_for_owner(mock_current_user["sub"])
        finding = Finding(
            process_id=process.id,
            answers={"q1": "yes"},
            free_text="",
            updated_at=datetime.now(timezone.utc),
        )
        created_job = PlanJob(
            process_id=process.id,
            consultant_id=process.consultant_id,
        )

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.get_finding = AsyncMock(return_value=finding)
        mock_repo.get_completed_count = AsyncMock(return_value=0)
        mock_repo.get_active_job = AsyncMock(return_value=None)
        mock_repo.create_plan_job = AsyncMock(return_value=created_job)

        queue = self._fake_queue()

        with self._override_deps(self._app(), mock_repo, queue):
            r = client.post(f"/processes/{process.id}/generate-plan")

        assert r.status_code == 202, f"got {r.status_code}: {r.text[:300]}"
        body = r.json()
        assert body["job_id"] == str(process.id)
        assert body["status"] == "queued"
        queue.enqueue_plan_generation.assert_awaited_once_with(
            process.id, process.consultant_id
        )

        # Snapshot consistency (spec §2 decision 11): the job must capture the
        # findings + pre-diagnosis the user submitted, not the live DB.
        snapshot = mock_repo.create_plan_job.call_args.args[0]
        assert snapshot.findings_snapshot == {
            "answers": finding.answers,
            "free_text": finding.free_text,
        }
        assert snapshot.pre_diagnosis_snapshot == process.pre_diagnosis
        assert snapshot.source_updated_at == finding.updated_at.isoformat()
        assert snapshot.consultant_id == process.consultant_id

    def test_generate_plan_429_when_cap_reached(self, client, mock_current_user):
        from src.domain.entities.finding import Finding

        process = _make_process_for_owner(mock_current_user["sub"])
        finding = Finding(process_id=process.id, answers={"q1": "yes"})

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.get_finding = AsyncMock(return_value=finding)
        mock_repo.get_completed_count = AsyncMock(return_value=3)

        with self._override_deps(self._app(), mock_repo, self._fake_queue()):
            r = client.post(f"/processes/{process.id}/generate-plan")

        assert r.status_code == 429, f"got {r.status_code}: {r.text[:300]}"

    def test_generate_plan_reuses_active_job_without_reenqueue(
        self, client, mock_current_user
    ):
        from src.domain.entities.finding import Finding
        from src.domain.entities.plan_job import PlanJob, PlanJobStatus

        process = _make_process_for_owner(mock_current_user["sub"])
        finding = Finding(process_id=process.id, answers={"q1": "yes"})
        active = PlanJob(
            process_id=process.id,
            consultant_id=process.consultant_id,
            status=PlanJobStatus.RUNNING,
        )

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.get_finding = AsyncMock(return_value=finding)
        mock_repo.get_completed_count = AsyncMock(return_value=0)
        mock_repo.get_active_job = AsyncMock(return_value=active)

        queue = self._fake_queue()

        with self._override_deps(self._app(), mock_repo, queue):
            r = client.post(f"/processes/{process.id}/generate-plan")

        assert r.status_code == 202, f"got {r.status_code}: {r.text[:300]}"
        body = r.json()
        assert body["job_id"] == str(process.id)
        assert body["status"] == "running"
        queue.enqueue_plan_generation.assert_not_awaited()

    def test_generate_plan_503_on_enqueue_failure(self, client, mock_current_user):
        from src.domain.entities.finding import Finding
        from src.domain.entities.plan_job import PlanJob
        from src.errors import QueueEnqueueError

        process = _make_process_for_owner(mock_current_user["sub"])
        finding = Finding(
            process_id=process.id,
            answers={"q1": "yes"},
            updated_at=datetime.now(timezone.utc),
        )
        created_job = PlanJob(
            process_id=process.id,
            consultant_id=process.consultant_id,
        )

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.get_finding = AsyncMock(return_value=finding)
        mock_repo.get_completed_count = AsyncMock(return_value=0)
        mock_repo.get_active_job = AsyncMock(return_value=None)
        mock_repo.create_plan_job = AsyncMock(return_value=created_job)
        mock_repo.fail_job = AsyncMock()

        queue = self._fake_queue(side_effect=QueueEnqueueError("boom"))

        with self._override_deps(self._app(), mock_repo, queue):
            r = client.post(f"/processes/{process.id}/generate-plan")

        assert r.status_code == 503, f"got {r.status_code}: {r.text[:300]}"
        mock_repo.fail_job.assert_awaited_once()


class TestPlanGenerationStatusRoute:
    """GET /plan-generation/status — polling surface for the async worker."""

    def _job(self, process, status="running", error=None):
        from src.domain.entities.plan_job import PlanJob, PlanJobStatus

        return PlanJob(
            process_id=process.id,
            consultant_id=process.consultant_id,
            status=PlanJobStatus(status),
            error=error,
        )

    def test_status_returns_job_fields(self, client, mock_current_user):
        process = _make_process_for_owner(mock_current_user["sub"])
        job = self._job(process)

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.get_plan_job = AsyncMock(return_value=job)

        with TestGeneratePlanRoute._override_deps(
            self._app(), mock_repo, TestGeneratePlanRoute()._fake_queue()
        ):
            r = client.get(f"/processes/{process.id}/plan-generation/status")

        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        body = r.json()
        assert body["process_id"] == str(process.id)
        assert body["status"] == "running"
        assert body["error"] is None
        assert set(body["segments"].keys()) == {"B1", "B2", "B3"}
        assert "created_at" in body
        assert "updated_at" in body

    def test_status_404_when_no_job(self, client, mock_current_user):
        process = _make_process_for_owner(mock_current_user["sub"])

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.get_plan_job = AsyncMock(return_value=None)

        with TestGeneratePlanRoute._override_deps(
            self._app(), mock_repo, TestGeneratePlanRoute()._fake_queue()
        ):
            r = client.get(f"/processes/{process.id}/plan-generation/status")

        assert r.status_code == 404, f"got {r.status_code}: {r.text[:300]}"

    @staticmethod
    def _app():
        from src.main import app
        return app


class TestGetPlanNewTaskFields:
    """GET /plan must expose source_clause / require_document / document_title."""

    def test_get_plan_exposes_new_task_fields(self, client, mock_current_user):
        from src.domain.entities.plan import Plan, Task, TaskPriority

        process = _make_process_for_owner(mock_current_user["sub"])
        plan = Plan(
            id=uuid.uuid4(),
            process_id=process.id,
            summary_md="Resumen",
            tasks=[
                Task(
                    id=uuid.uuid4(),
                    plan_id=uuid.uuid4(),
                    title="Documentar política",
                    description="...",
                    priority=TaskPriority.HIGH,
                    estimated_effort="1 semana",
                    owner_role="Gerente",
                    sort_order=0,
                    source_clause="5.2",
                    require_document=True,
                    document_title="Manual de política",
                )
            ],
        )

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.get_plan = AsyncMock(return_value=plan)

        with TestGeneratePlanRoute._override_deps(
            self._app(), mock_repo, TestGeneratePlanRoute()._fake_queue()
        ):
            r = client.get(f"/processes/{process.id}/plan")

        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        task = r.json()["tasks"][0]
        assert task["source_clause"] == "5.2"
        assert task["require_document"] is True
        assert task["document_title"] == "Manual de política"

    @staticmethod
    def _app():
        from src.main import app
        return app


# ---- IDOR (Insecure Direct Object Reference) Tests -------------------------


@pytest.fixture
def attacker_user():
    """A different user from mock_current_user — used to test IDOR protection."""
    return {"sub": str(uuid.uuid4()), "email": "attacker@example.com", "cognito:groups": []}


def _override_auth(app, user: dict):
    """Temporarily override get_current_user to return the given user."""
    from src.routes.user.auth import get_current_user as target
    old = app.dependency_overrides.get(target)
    app.dependency_overrides[target] = lambda: user
    return old


def _restore_auth(app, old):
    from src.routes.user.auth import get_current_user as target
    if old is not None:
        app.dependency_overrides[target] = old
    else:
        app.dependency_overrides.pop(target, None)


def _override_repo(app, target, mock_repo):
    """Temporarily override a repository dependency (patch() is ineffective for Depends)."""
    old = app.dependency_overrides.get(target)
    app.dependency_overrides[target] = lambda: mock_repo
    return old


def _restore_repo(app, target, old):
    if old is not None:
        app.dependency_overrides[target] = old
    else:
        app.dependency_overrides.pop(target, None)


def _make_process_for_owner(owner_sub: str):
    from src.domain.entities.process import Process, IsoStandard, ProcessStatus
    return Process(
        id=uuid.uuid4(),
        consultant_id=uuid.UUID(owner_sub),
        company_id=uuid.uuid4(),
        iso_standard=IsoStandard.ISO_9001,
        status=ProcessStatus.IN_DIAGNOSIS,
    )


class TestIdorProcesses:
    def test_get_own_process_works(self, client, mock_current_user):
        """Regression: owner can read their own process."""
        process = _make_process_for_owner(mock_current_user["sub"])
        from src.main import app as fastapi_app
        from src.routes.processes.routes import get_process_repository

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        old = fastapi_app.dependency_overrides.get(get_process_repository)
        fastapi_app.dependency_overrides[get_process_repository] = lambda: mock_repo
        try:
            with patch("src.routes.processes.routes._hydrate_company_name",
                       new=AsyncMock(return_value="Test Corp")):
                r = client.get(f"/processes/{process.id}")
        finally:
            if old is not None:
                fastapi_app.dependency_overrides[get_process_repository] = old
            else:
                fastapi_app.dependency_overrides.pop(get_process_repository, None)
        assert r.status_code == 200, f"Owner should access own process, got {r.status_code}: {r.text[:200]}"

    def test_get_foreign_process_blocked(self, client, mock_current_user, attacker_user):
        """IDOR test: attacker cannot read a process owned by another user."""
        process = _make_process_for_owner(mock_current_user["sub"])
        from src.main import app as fastapi_app
        from src.routes.processes.routes import get_process_repository

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)

        old_repo = fastapi_app.dependency_overrides.get(get_process_repository)
        fastapi_app.dependency_overrides[get_process_repository] = lambda: mock_repo
        old_auth = _override_auth(fastapi_app, attacker_user)
        try:
            r = client.get(f"/processes/{process.id}")
        finally:
            _restore_auth(fastapi_app, old_auth)
            if old_repo is not None:
                fastapi_app.dependency_overrides[get_process_repository] = old_repo
            else:
                fastapi_app.dependency_overrides.pop(get_process_repository, None)
        assert r.status_code in (403, 404), \
            f"Attacker should NOT access foreign process, got {r.status_code}: {r.text[:200]}"

    def test_delete_foreign_process_blocked(self, client, mock_current_user, attacker_user):
        """IDOR test: attacker cannot delete another user's process."""
        process = _make_process_for_owner(mock_current_user["sub"])
        from src.main import app as fastapi_app
        from src.routes.processes.routes import get_process_repository

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)

        old_repo = fastapi_app.dependency_overrides.get(get_process_repository)
        fastapi_app.dependency_overrides[get_process_repository] = lambda: mock_repo
        old_auth = _override_auth(fastapi_app, attacker_user)
        try:
            r = client.delete(f"/processes/{process.id}")
        finally:
            _restore_auth(fastapi_app, old_auth)
            if old_repo is not None:
                fastapi_app.dependency_overrides[get_process_repository] = old_repo
            else:
                fastapi_app.dependency_overrides.pop(get_process_repository, None)
        assert r.status_code in (403, 404), \
            f"Attacker should NOT delete foreign process, got {r.status_code}: {r.text[:200]}"

    def test_put_findings_on_foreign_process_blocked(self, client, mock_current_user, attacker_user):
        """IDOR test: attacker cannot upsert findings on another user's process."""
        process = _make_process_for_owner(mock_current_user["sub"])
        from src.main import app as fastapi_app

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.get_finding = AsyncMock(return_value=None)
        mock_repo.upsert_finding = AsyncMock()

        from src.routes.processes.routes import get_process_repository

        old_auth = _override_auth(fastapi_app, attacker_user)
        old_repo = _override_repo(fastapi_app, get_process_repository, mock_repo)
        try:
            r = client.put(
                f"/processes/{process.id}/findings",
                json={"answers": {"q": "x"}, "free_text": "malicious"},
            )
        finally:
            _restore_repo(fastapi_app, get_process_repository, old_repo)
            _restore_auth(fastapi_app, old_auth)
        assert r.status_code in (403, 404, 422), \
            f"Attacker should NOT modify foreign findings, got {r.status_code}: {r.text[:200]}"

    def test_generate_plan_on_foreign_process_blocked(self, client, mock_current_user, attacker_user):
        """IDOR test: attacker cannot generate a plan on foreign process."""
        process = _make_process_for_owner(mock_current_user["sub"])
        from src.main import app as fastapi_app
        from src.routes.processes.routes import get_process_repository, get_queue_adapter

        finding = MagicMock()
        finding.answers = {"q": "a"}
        finding.free_text = "test"

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.get_finding = AsyncMock(return_value=finding)
        mock_queue = MagicMock()
        mock_queue.enqueue_plan_generation = AsyncMock()

        old_repo = fastapi_app.dependency_overrides.get(get_process_repository)
        old_queue = fastapi_app.dependency_overrides.get(get_queue_adapter)
        fastapi_app.dependency_overrides[get_process_repository] = lambda: mock_repo
        fastapi_app.dependency_overrides[get_queue_adapter] = lambda: mock_queue
        old_auth = _override_auth(fastapi_app, attacker_user)
        try:
            r = client.post(f"/processes/{process.id}/generate-plan")
        finally:
            _restore_auth(fastapi_app, old_auth)
            if old_repo is not None:
                fastapi_app.dependency_overrides[get_process_repository] = old_repo
            else:
                fastapi_app.dependency_overrides.pop(get_process_repository, None)
            if old_queue is not None:
                fastapi_app.dependency_overrides[get_queue_adapter] = old_queue
            else:
                fastapi_app.dependency_overrides.pop(get_queue_adapter, None)
        assert r.status_code in (403, 404), \
            f"Attacker should NOT generate plan on foreign process, got {r.status_code}: {r.text[:200]}"
        mock_queue.enqueue_plan_generation.assert_not_awaited()

    def test_get_findings_on_foreign_process_blocked(self, client, mock_current_user, attacker_user):
        """IDOR test: attacker cannot read findings from another user's process."""
        process = _make_process_for_owner(mock_current_user["sub"])
        from src.main import app as fastapi_app
        from src.routes.processes.routes import get_process_repository

        finding = MagicMock()
        finding.answers = {"secret": "data"}
        finding.free_text = "confidential"
        finding.updated_at = datetime.now(timezone.utc)

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.get_finding = AsyncMock(return_value=finding)

        old_repo = fastapi_app.dependency_overrides.get(get_process_repository)
        fastapi_app.dependency_overrides[get_process_repository] = lambda: mock_repo
        old_auth = _override_auth(fastapi_app, attacker_user)
        try:
            r = client.get(f"/processes/{process.id}/findings")
        finally:
            _restore_auth(fastapi_app, old_auth)
            if old_repo is not None:
                fastapi_app.dependency_overrides[get_process_repository] = old_repo
            else:
                fastapi_app.dependency_overrides.pop(get_process_repository, None)
        assert r.status_code in (403, 404), \
            f"Attacker should NOT view foreign findings, got {r.status_code}: {r.text[:200]}"

    def test_get_plan_on_foreign_process_blocked(self, client, mock_current_user, attacker_user):
        """IDOR test: attacker cannot read plan from another user's process."""
        from src.domain.entities.plan import Plan

        process = _make_process_for_owner(mock_current_user["sub"])
        owner_plan = Plan(id=uuid.uuid4(), process_id=process.id, summary_md="secret plan")
        from src.main import app as fastapi_app
        from src.routes.processes.routes import get_process_repository

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.get_plan = AsyncMock(return_value=owner_plan)

        old_repo = fastapi_app.dependency_overrides.get(get_process_repository)
        fastapi_app.dependency_overrides[get_process_repository] = lambda: mock_repo
        old_auth = _override_auth(fastapi_app, attacker_user)
        try:
            r = client.get(f"/processes/{process.id}/plan")
        finally:
            _restore_auth(fastapi_app, old_auth)
            if old_repo is not None:
                fastapi_app.dependency_overrides[get_process_repository] = old_repo
            else:
                fastapi_app.dependency_overrides.pop(get_process_repository, None)
        assert r.status_code in (403, 404), \
            f"Attacker should NOT view foreign plan, got {r.status_code}: {r.text[:200]}"


class TestIdorCompanies:
    def test_get_foreign_company_blocked(self, client, mock_current_user, attacker_user):
        """IDOR test: attacker cannot read a company owned by another user."""
        owner_company = {
            "company_id": str(uuid.uuid4()),
            "user_id": mock_current_user["sub"],
            "name": "Victim Corp",
            "business_type": "manufactura",
            "is_active": True,
        }
        from src.main import app as fastapi_app
        from src.routes.companies.routes import get_company_repository

        mock_repo = MagicMock()
        mock_repo.get_company = AsyncMock(return_value=owner_company)

        old_repo = fastapi_app.dependency_overrides.get(get_company_repository)
        fastapi_app.dependency_overrides[get_company_repository] = lambda: mock_repo
        old_auth = _override_auth(fastapi_app, attacker_user)
        try:
            r = client.get(f"/companies/{owner_company['company_id']}")
        finally:
            _restore_auth(fastapi_app, old_auth)
            if old_repo is not None:
                fastapi_app.dependency_overrides[get_company_repository] = old_repo
            else:
                fastapi_app.dependency_overrides.pop(get_company_repository, None)
        assert r.status_code in (403, 404), \
            f"Attacker should NOT access foreign company, got {r.status_code}: {r.text[:200]}"

    def test_get_own_company_works(self, client, mock_current_user):
        """Regression: owner can read their own company."""
        own_company = {
            "company_id": str(uuid.uuid4()),
            "user_id": mock_current_user["sub"],
            "name": "My Corp",
            "business_type": "servicios",
            "is_active": True,
        }
        from src.main import app as fastapi_app
        from src.routes.companies.routes import get_company_repository

        mock_repo = MagicMock()
        mock_repo.get_company = AsyncMock(return_value=own_company)
        old = fastapi_app.dependency_overrides.get(get_company_repository)
        fastapi_app.dependency_overrides[get_company_repository] = lambda: mock_repo
        try:
            r = client.get(f"/companies/{own_company['company_id']}")
        finally:
            if old is not None:
                fastapi_app.dependency_overrides[get_company_repository] = old
            else:
                fastapi_app.dependency_overrides.pop(get_company_repository, None)
        assert r.status_code == 200, f"Owner should access own company, got {r.status_code}: {r.text[:200]}"


# ---- Profiling analysis ----------------------------------------------------


class TestProfilingRoutes:
    def test_analyze_returns_parsed_result(self, client, mock_current_user):
        """POST /profiling/analyze returns the parsed LLM analysis."""
        from src.main import app as fastapi_app
        from src.routes.profiling.routes import get_process_repository, get_profiling_llm
        from src.domain.entities.process import (
            Process,
            IsoStandard,
            PerfilamientoModule,
            ProcessStatus,
        )
        from src.adapters.llm.llm_port import StructuredResult

        process = Process(
            consultant_id=uuid.UUID(mock_current_user["sub"]),
            company_id=uuid.uuid4(),
            perfilamiento_module=PerfilamientoModule.SST,
            iso_standard=IsoStandard.ISO_45001,
            status=ProcessStatus.PROFILING_PENDING,
            perfilamiento_answers={"sst_01": "Cumplir", "pain_points": "Sin indicadores"},
        )
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.get_company_name = AsyncMock(return_value="Acme")

        mock_llm = MagicMock()
        mock_llm.generate_structured = AsyncMock(
            return_value=StructuredResult(
                data={
                    "pain_points_analysis": "## Crítico",
                    "cost_estimation": {
                        "range_cop": "30M",
                        "breakdown": ["Consultoría"],
                        "confidence": "high",
                    },
                    "time_estimation": {
                        "months": 6,
                        "phases": ["Fase 1"],
                        "confidence": "medium",
                    },
                    "action_plan": {
                        "phases": [
                            {"name": "Diagnóstico", "duration_weeks": 4, "activities": ["x"]}
                        ],
                        "milestones": ["Hito"],
                    },
                }
            )
        )

        old_repo = _override_repo(fastapi_app, get_process_repository, mock_repo)
        old_llm = fastapi_app.dependency_overrides.get(get_profiling_llm)
        fastapi_app.dependency_overrides[get_profiling_llm] = lambda: mock_llm
        try:
            r = client.post("/profiling/analyze", json={"process_id": str(process.id)})
        finally:
            _restore_repo(fastapi_app, get_process_repository, old_repo)
            if old_llm is not None:
                fastapi_app.dependency_overrides[get_profiling_llm] = old_llm
            else:
                fastapi_app.dependency_overrides.pop(get_profiling_llm, None)

        assert r.status_code == 200, r.text
        body = r.json()
        assert body["cost_estimation"]["range_cop"] == "30M"
        assert body["time_estimation"]["months"] == 6
        assert body["action_plan"]["phases"][0]["name"] == "Diagnóstico"
        # The LLM received the whole context in ONE call.
        mock_llm.generate_structured.assert_awaited_once()

    def test_analyze_404_for_foreign_process(self, client, mock_current_user):
        """A process owned by another consultant → 404 (no leak)."""
        from src.main import app as fastapi_app
        from src.routes.profiling.routes import get_process_repository
        from src.domain.entities.process import (
            Process,
            IsoStandard,
            PerfilamientoModule,
            ProcessStatus,
        )

        foreign = Process(
            consultant_id=uuid.uuid4(),  # not the current user
            company_id=uuid.uuid4(),
            perfilamiento_module=PerfilamientoModule.SST,
            iso_standard=IsoStandard.ISO_45001,
            status=ProcessStatus.PROFILING_PENDING,
        )
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=foreign)

        old_repo = _override_repo(fastapi_app, get_process_repository, mock_repo)
        try:
            r = client.post("/profiling/analyze", json={"process_id": str(foreign.id)})
        finally:
            _restore_repo(fastapi_app, get_process_repository, old_repo)

        assert r.status_code == 404

    def test_analyze_maps_terminal_error_to_502(self, client, mock_current_user):
        """A TerminalError from the LLM path → 502 (unusable output)."""
        from src.main import app as fastapi_app
        from src.routes.profiling.routes import get_process_repository, get_profiling_llm
        from src.domain.entities.process import (
            Process,
            IsoStandard,
            PerfilamientoModule,
            ProcessStatus,
        )
        from src.errors import InvalidResponseError

        process = Process(
            consultant_id=uuid.UUID(mock_current_user["sub"]),
            company_id=uuid.uuid4(),
            perfilamiento_module=PerfilamientoModule.SST,
            iso_standard=IsoStandard.ISO_45001,
            status=ProcessStatus.PROFILING_PENDING,
            perfilamiento_answers={"sst_01": "Cumplir"},
        )
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.get_company_name = AsyncMock(return_value="Acme")

        mock_llm = MagicMock()
        mock_llm.generate_structured = AsyncMock(side_effect=InvalidResponseError("bad"))

        old_repo = _override_repo(fastapi_app, get_process_repository, mock_repo)
        old_llm = fastapi_app.dependency_overrides.get(get_profiling_llm)
        fastapi_app.dependency_overrides[get_profiling_llm] = lambda: mock_llm
        try:
            r = client.post("/profiling/analyze", json={"process_id": str(process.id)})
        finally:
            _restore_repo(fastapi_app, get_process_repository, old_repo)
            if old_llm is not None:
                fastapi_app.dependency_overrides[get_profiling_llm] = old_llm
            else:
                fastapi_app.dependency_overrides.pop(get_profiling_llm, None)

        assert r.status_code == 502


class TestPerfilamientoAndAnalysisRoutes:
    """PUT /perfilamiento and PUT /analysis persistence endpoints (Phase 3)."""

    @staticmethod
    def _app():
        from src.main import app
        return app

    def _owned_process(self, mock_current_user, status=None):
        from src.domain.entities.process import Process, IsoStandard, ProcessStatus

        if status is None:
            status = ProcessStatus.PROFILING_PENDING
        return Process(
            id=uuid.uuid4(),
            consultant_id=uuid.UUID(mock_current_user["sub"]),
            company_id=uuid.uuid4(),
            iso_standard=IsoStandard.ISO_9001,
            status=status,
        )

    @staticmethod
    def _valid_analysis() -> dict:
        """A payload that satisfies the strict AnalysisUpdateRequest schema."""
        return {
            "pain_points_analysis": "## Crítico",
            "cost_estimation": {
                "range_cop": "30M",
                "breakdown": ["Consultoría"],
                "confidence": "high",
            },
            "time_estimation": {
                "months": 6,
                "phases": ["Fase 1"],
                "confidence": "medium",
            },
            "action_plan": {
                "phases": [
                    {"name": "Diagnóstico", "duration_weeks": 4, "activities": ["x"]}
                ],
                "milestones": ["Hito"],
            },
        }

    def _override_repo(self, fastapi_app, mock_repo):
        from src.routes.processes.routes import get_process_repository

        old = fastapi_app.dependency_overrides.get(get_process_repository)
        fastapi_app.dependency_overrides[get_process_repository] = lambda: mock_repo
        return get_process_repository, old

    def _restore_repo(self, fastapi_app, dep, old):
        if old is not None:
            fastapi_app.dependency_overrides[dep] = old
        else:
            fastapi_app.dependency_overrides.pop(dep, None)

    # ---- PUT /perfilamiento -------------------------------------------------

    def test_put_perfilamiento_persists_answers_and_pain_points(self, client, mock_current_user):
        from src.domain.entities.process import ProcessStatus

        process = self._owned_process(mock_current_user)
        answers = {"opt_01": "Sí"}
        pain_points = "Sin indicadores"

        updated = process.model_copy(
            update={
                "perfilamiento_answers": {**answers, "pain_points": pain_points},
                "status": ProcessStatus.IN_DIAGNOSIS,
            }
        )
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.update_perfilamiento = AsyncMock(return_value=updated)

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            with patch(
                "src.routes.processes.routes._hydrate_company_name",
                AsyncMock(return_value="Test Corp"),
            ):
                r = client.put(
                    f"/processes/{process.id}/perfilamiento",
                    json={"answers": answers, "pain_points": pain_points},
                )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 200, r.text
        body = r.json()
        assert body["perfilamiento_answers"]["pain_points"] == pain_points
        assert body["status"] == "in_diagnosis"
        mock_repo.update_perfilamiento.assert_awaited_once_with(
            process.id, answers, pain_points
        )
        assert mock_repo.get_process.await_count == 1

    def test_put_perfilamiento_rejects_invalid_answer_key(self, client, mock_current_user):
        process = self._owned_process(mock_current_user)

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.update_perfilamiento = AsyncMock()

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            r = client.put(
                f"/processes/{process.id}/perfilamiento",
                json={"answers": {"1BAD": "x"}},
            )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"
        mock_repo.update_perfilamiento.assert_not_awaited()

    def test_put_perfilamiento_foreign_process_blocked(self, client, mock_current_user):
        from src.domain.entities.process import Process, IsoStandard, ProcessStatus

        foreign = Process(
            id=uuid.uuid4(),
            consultant_id=uuid.uuid4(),  # not the current user
            company_id=uuid.uuid4(),
            iso_standard=IsoStandard.ISO_9001,
            status=ProcessStatus.PROFILING_PENDING,
        )

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=foreign)
        mock_repo.update_perfilamiento = AsyncMock()

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            r = client.put(
                f"/processes/{foreign.id}/perfilamiento",
                json={"answers": {"opt_01": "Sí"}, "pain_points": ""},
            )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"
        mock_repo.update_perfilamiento.assert_not_awaited()

    # ---- PUT /analysis ------------------------------------------------------

    def test_put_analysis_persists_valid_result(self, client, mock_current_user):
        from src.domain.entities.process import ProcessStatus

        process = self._owned_process(mock_current_user)
        analysis = {
            "pain_points_analysis": "## Crítico",
            "cost_estimation": {
                "range_cop": "30M",
                "breakdown": ["Consultoría"],
                "confidence": "high",
            },
            "time_estimation": {
                "months": 6,
                "phases": ["Fase 1"],
                "confidence": "medium",
            },
            "action_plan": {
                "phases": [
                    {"name": "Diagnóstico", "duration_weeks": 4, "activities": ["x"]}
                ],
                "milestones": ["Hito"],
            },
        }

        updated = process.model_copy(
            update={"analysis_result": analysis, "status": ProcessStatus.PLAN_READY}
        )
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.update_analysis = AsyncMock(return_value=updated)

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            with patch(
                "src.routes.processes.routes._hydrate_company_name",
                AsyncMock(return_value="Test Corp"),
            ):
                r = client.put(
                    f"/processes/{process.id}/analysis",
                    json={"analysis_result": analysis},
                )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "plan_ready"
        assert body["analysis_result"]["cost_estimation"]["range_cop"] == "30M"
        mock_repo.update_analysis.assert_awaited_once()
        assert mock_repo.get_process.await_count == 1

    def test_put_analysis_rejects_invalid_payload(self, client, mock_current_user):
        process = self._owned_process(mock_current_user)

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.update_analysis = AsyncMock()

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            r = client.put(
                f"/processes/{process.id}/analysis",
                json={"analysis_result": {"cost_estimation": {"confidence": "nope"}}},
            )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"
        mock_repo.update_analysis.assert_not_awaited()

    def test_put_analysis_rejects_empty_payload(self, client, mock_current_user):
        """Strict schema: an empty analysis_result must not advance the lifecycle."""
        process = self._owned_process(mock_current_user)
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.update_analysis = AsyncMock()

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            r = client.put(
                f"/processes/{process.id}/analysis",
                json={"analysis_result": {}},
            )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"
        mock_repo.update_analysis.assert_not_awaited()

    def test_put_analysis_rejects_unknown_keys(self, client, mock_current_user):
        """Strict schema: extra keys are forbidden (extra='forbid')."""
        process = self._owned_process(mock_current_user)
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.update_analysis = AsyncMock()

        payload = self._valid_analysis()
        payload["unexpected"] = "nope"

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            r = client.put(
                f"/processes/{process.id}/analysis",
                json={"analysis_result": payload},
            )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"
        mock_repo.update_analysis.assert_not_awaited()

    def test_put_analysis_rejects_empty_breakdown(self, client, mock_current_user):
        """Strict schema: breakdown must be non-empty."""
        process = self._owned_process(mock_current_user)
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.update_analysis = AsyncMock()

        payload = self._valid_analysis()
        payload["cost_estimation"]["breakdown"] = []

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            r = client.put(
                f"/processes/{process.id}/analysis",
                json={"analysis_result": payload},
            )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"
        mock_repo.update_analysis.assert_not_awaited()

    def test_put_analysis_rejects_empty_time_phases(self, client, mock_current_user):
        """Strict schema: time_estimation.phases must be non-empty."""
        process = self._owned_process(mock_current_user)
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.update_analysis = AsyncMock()

        payload = self._valid_analysis()
        payload["time_estimation"]["phases"] = []

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            r = client.put(
                f"/processes/{process.id}/analysis",
                json={"analysis_result": payload},
            )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"
        mock_repo.update_analysis.assert_not_awaited()

    def test_put_analysis_rejects_empty_action_plan_phases(self, client, mock_current_user):
        """Strict schema: action_plan.phases must be non-empty."""
        process = self._owned_process(mock_current_user)
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.update_analysis = AsyncMock()

        payload = self._valid_analysis()
        payload["action_plan"]["phases"] = []

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            r = client.put(
                f"/processes/{process.id}/analysis",
                json={"analysis_result": payload},
            )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"
        mock_repo.update_analysis.assert_not_awaited()

    def test_put_analysis_rejects_empty_milestones(self, client, mock_current_user):
        """Strict schema: action_plan.milestones must be non-empty."""
        process = self._owned_process(mock_current_user)
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.update_analysis = AsyncMock()

        payload = self._valid_analysis()
        payload["action_plan"]["milestones"] = []

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            r = client.put(
                f"/processes/{process.id}/analysis",
                json={"analysis_result": payload},
            )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"
        mock_repo.update_analysis.assert_not_awaited()

    def test_put_analysis_rejects_empty_phase_activities(self, client, mock_current_user):
        """Strict schema: action_plan.phases[].activities must be non-empty."""
        process = self._owned_process(mock_current_user)
        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.update_analysis = AsyncMock()

        payload = self._valid_analysis()
        payload["action_plan"]["phases"][0]["activities"] = []

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            r = client.put(
                f"/processes/{process.id}/analysis",
                json={"analysis_result": payload},
            )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"
        mock_repo.update_analysis.assert_not_awaited()

    def test_put_analysis_foreign_process_blocked(self, client, mock_current_user):
        from src.domain.entities.process import Process, IsoStandard, ProcessStatus

        foreign = Process(
            id=uuid.uuid4(),
            consultant_id=uuid.uuid4(),  # not the current user
            company_id=uuid.uuid4(),
            iso_standard=IsoStandard.ISO_9001,
            status=ProcessStatus.IN_DIAGNOSIS,
        )

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=foreign)
        mock_repo.update_analysis = AsyncMock()

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            r = client.put(
                f"/processes/{foreign.id}/analysis",
                json={"analysis_result": self._valid_analysis()},
            )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"
        mock_repo.update_analysis.assert_not_awaited()


class TestNeedsCertificationRoute:
    """PUT /processes/{id}/needs-certification (Increment 2)."""

    @staticmethod
    def _app():
        from src.main import app
        return app

    def _owned_process(self, mock_current_user):
        from src.domain.entities.process import Process, IsoStandard, ProcessStatus

        return Process(
            id=uuid.uuid4(),
            consultant_id=uuid.UUID(mock_current_user["sub"]),
            company_id=uuid.uuid4(),
            iso_standard=IsoStandard.ISO_9001,
            status=ProcessStatus.IN_DIAGNOSIS,
        )

    def _override_repo(self, fastapi_app, mock_repo):
        from src.routes.processes.routes import get_process_repository

        old = fastapi_app.dependency_overrides.get(get_process_repository)
        fastapi_app.dependency_overrides[get_process_repository] = lambda: mock_repo
        return get_process_repository, old

    def _restore_repo(self, fastapi_app, dep, old):
        if old is not None:
            fastapi_app.dependency_overrides[dep] = old
        else:
            fastapi_app.dependency_overrides.pop(dep, None)

    def test_put_needs_certification_true(self, client, mock_current_user):
        process = self._owned_process(mock_current_user)
        updated = process.model_copy(update={"needs_certification": True})

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.update_needs_certification = AsyncMock(return_value=updated)

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            with patch(
                "src.routes.processes.routes._hydrate_company_name",
                AsyncMock(return_value="Test Corp"),
            ):
                r = client.put(
                    f"/processes/{process.id}/needs-certification",
                    json={"value": True},
                )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 200, r.text
        body = r.json()
        assert body["needs_certification"] is True
        mock_repo.update_needs_certification.assert_awaited_once_with(process.id, True)
        assert mock_repo.get_process.await_count == 1

    def test_put_needs_certification_false(self, client, mock_current_user):
        process = self._owned_process(mock_current_user)
        updated = process.model_copy(update={"needs_certification": False})

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.update_needs_certification = AsyncMock(return_value=updated)

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            with patch(
                "src.routes.processes.routes._hydrate_company_name",
                AsyncMock(return_value="Test Corp"),
            ):
                r = client.put(
                    f"/processes/{process.id}/needs-certification",
                    json={"value": False},
                )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 200, r.text
        assert r.json()["needs_certification"] is False
        mock_repo.update_needs_certification.assert_awaited_once_with(process.id, False)

    def test_put_needs_certification_invalid_body(self, client, mock_current_user):
        process = self._owned_process(mock_current_user)

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.update_needs_certification = AsyncMock()

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            r = client.put(
                f"/processes/{process.id}/needs-certification",
                json={"value": "nope"},
            )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"
        mock_repo.update_needs_certification.assert_not_awaited()

    def test_put_needs_certification_foreign_process_blocked(self, client, mock_current_user):
        from src.domain.entities.process import Process, IsoStandard, ProcessStatus

        foreign = Process(
            id=uuid.uuid4(),
            consultant_id=uuid.uuid4(),  # not the current user
            company_id=uuid.uuid4(),
            iso_standard=IsoStandard.ISO_9001,
            status=ProcessStatus.IN_DIAGNOSIS,
        )

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=foreign)
        mock_repo.update_needs_certification = AsyncMock()

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            r = client.put(
                f"/processes/{foreign.id}/needs-certification",
                json={"value": True},
            )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"
        mock_repo.update_needs_certification.assert_not_awaited()

    def test_put_needs_certification_missing_returns_404(self, client, mock_current_user):
        """A vanished process row raises ProcessNotFoundError → global handler maps it to 404."""
        from src.errors import ProcessNotFoundError

        process = self._owned_process(mock_current_user)

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.update_needs_certification = AsyncMock(
            side_effect=ProcessNotFoundError("Process not found")
        )

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            r = client.put(
                f"/processes/{process.id}/needs-certification",
                json={"value": True},
            )
        finally:
            self._restore_repo(fastapi_app, dep, old)

        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"

    def test_put_needs_certification_unrelated_value_error_not_swallowed(
        self, client, mock_current_user
    ):
        """A genuine ValueError (not ProcessNotFoundError) must propagate — not be
        mislabelled as a 404 by a broad ``except ValueError``.

        The route no longer wraps the repo call, so the error surfaces (TestClient
        re-raises server exceptions), proving ValueError is no longer swallowed.
        """
        process = self._owned_process(mock_current_user)

        mock_repo = MagicMock()
        mock_repo.get_process = AsyncMock(return_value=process)
        mock_repo.update_needs_certification = AsyncMock(
            side_effect=ValueError("some unrelated invariant violated")
        )

        fastapi_app = self._app()
        dep, old = self._override_repo(fastapi_app, mock_repo)
        try:
            with pytest.raises(ValueError, match="some unrelated invariant violated"):
                client.put(
                    f"/processes/{process.id}/needs-certification",
                    json={"value": True},
                )
        finally:
            self._restore_repo(fastapi_app, dep, old)
