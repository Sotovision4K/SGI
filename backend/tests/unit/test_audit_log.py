"""Tests for the LLM audit-log entity, SQLModel table, and repository method.

Spec: generation_plan-feature.md §6 — the `audit_logs_llm` table stores a
record of every LLM call made during plan generation. The repository write
method must never break generation: on DB failure it logs and swallows.
"""

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Entity tests
# ---------------------------------------------------------------------------

class TestAuditLogEntityCreation:
    def test_audit_log_entity_creation_minimal_fields(self):
        """Create AuditLogLLM with only required process_id; verify defaults."""
        from src.domain.entities.audit_log import AuditLogLLM, AuditLogStatus

        audit = AuditLogLLM(process_id=uuid.uuid4())

        assert isinstance(audit.id, uuid.UUID)
        assert isinstance(audit.process_id, uuid.UUID)
        # Optional / nullable fields default to None
        assert audit.job_id is None
        assert audit.bucket is None
        assert audit.response_json is None
        assert audit.error is None
        # Scalar defaults
        assert audit.attempt == 1
        assert audit.model == ""
        assert audit.iso_standard == ""
        assert audit.request_payload == {}
        assert audit.input_tokens == 0
        assert audit.output_tokens == 0
        assert audit.latency_ms == 0
        assert audit.status == AuditLogStatus.SUCCESS

    def test_audit_log_timestamps_created_at_set_on_creation(self):
        """created_at must be a timezone-aware UTC datetime auto-set on creation."""
        from src.domain.entities.audit_log import AuditLogLLM

        audit = AuditLogLLM(process_id=uuid.uuid4())
        assert isinstance(audit.created_at, datetime)
        assert audit.created_at.tzinfo is not None
        assert audit.created_at.tzinfo == timezone.utc


class TestAuditLogStatusEnum:
    def test_audit_log_status_enum_has_three_values(self):
        from src.domain.entities.audit_log import AuditLogStatus

        assert {s.value for s in AuditLogStatus} == {
            "success",
            "error",
            "retryable_error",
        }

    def test_audit_log_status_is_str_enum(self):
        from src.domain.entities.audit_log import AuditLogStatus

        assert AuditLogStatus.SUCCESS == "success"
        assert isinstance(AuditLogStatus.SUCCESS, str)


class TestAuditLogSerialization:
    def test_audit_log_serialization_round_trip(self):
        """Entity -> dict -> JSON -> entity round-trip preserves fields."""
        from src.domain.entities.audit_log import AuditLogLLM, AuditLogStatus

        audit = AuditLogLLM(
            process_id=uuid.uuid4(),
            job_id=uuid.uuid4(),
            bucket="B1",
            attempt=2,
            model="claude-3",
            iso_standard="iso9001",
            request_payload={"prompt": "hello", "n": 1},
            response_json={"text": "ok"},
            input_tokens=100,
            output_tokens=50,
            latency_ms=320,
            status=AuditLogStatus.SUCCESS,
        )

        # Q: How do we serialize a UUID-bearing Pydantic model to JSON?
        # A: Pydantic model_dump_json uses mode="json" to stringify UUIDs/datetimes.
        as_json = audit.model_dump_json()
        restored_data = json.loads(as_json)
        restored = AuditLogLLM.model_validate(restored_data)

        assert restored.id == audit.id
        assert restored.process_id == audit.process_id
        assert restored.job_id == audit.job_id
        assert restored.bucket == audit.bucket
        assert restored.attempt == audit.attempt
        assert restored.model == audit.model
        assert restored.iso_standard == audit.iso_standard
        assert restored.request_payload == audit.request_payload
        assert restored.response_json == audit.response_json
        assert restored.input_tokens == audit.input_tokens
        assert restored.output_tokens == audit.output_tokens
        assert restored.latency_ms == audit.latency_ms
        assert restored.status == audit.status


class TestAuditLogNullableFields:
    def test_audit_log_nullable_fields_accept_none(self):
        """job_id, bucket, response_json, error must all accept None."""
        from src.domain.entities.audit_log import AuditLogLLM, AuditLogStatus

        audit = AuditLogLLM(
            process_id=uuid.uuid4(),
            job_id=None,
            bucket=None,
            response_json=None,
            error=None,
            status=AuditLogStatus.ERROR,
        )

        assert audit.job_id is None
        assert audit.bucket is None
        assert audit.response_json is None
        assert audit.error is None
        assert audit.status == AuditLogStatus.ERROR


class TestAuditLogJsonbFields:
    def test_audit_log_request_payload_defaults_to_empty_dict(self):
        from src.domain.entities.audit_log import AuditLogLLM

        audit = AuditLogLLM(process_id=uuid.uuid4())
        assert audit.request_payload == {}
        assert isinstance(audit.request_payload, dict)


# ---------------------------------------------------------------------------
# SQLModel table tests
# ---------------------------------------------------------------------------

class TestAuditLogLlmTable:
    def test_audit_log_table_model_can_be_instantiated(self):
        """AuditLogLlmTable can be instantiated with required fields."""
        from src.adapters.db.process_repository import AuditLogLlmTable

        now = datetime.now(timezone.utc).isoformat()
        row = AuditLogLlmTable(
            id=uuid.uuid4(),
            process_id=uuid.uuid4(),
            request_payload=json.dumps({"prompt": "hi"}),
            created_at=now,
        )
        assert row.id is not None
        assert row.status == "success"  # default
        assert row.attempt == 1
        assert row.created_at == now

    def test_audit_log_table_tablename_is_audit_logs_llm(self):
        """The table maps to `audit_logs_llm` (underscores) per spec."""
        from src.adapters.db.process_repository import AuditLogLlmTable

        assert AuditLogLlmTable.__tablename__ == "audit_logs_llm"

    def test_audit_log_table_jsonb_dict_to_string_round_trip(self):
        """request_payload dict -> JSON string -> back to dict (SQLite compat)."""
        from src.adapters.db.process_repository import AuditLogLlmTable

        payload = {"prompt": "hello", "meta": {"seq": 3}}
        now = datetime.now(timezone.utc).isoformat()
        row = AuditLogLlmTable(
            id=uuid.uuid4(),
            process_id=uuid.uuid4(),
            request_payload=json.dumps(payload, ensure_ascii=False),
            response_json=json.dumps({"ok": True}),
            created_at=now,
        )
        # Reading back, the JSON string is parsed into a dict.
        assert json.loads(row.request_payload) == payload
        assert json.loads(row.response_json) == {"ok": True}

    def test_audit_log_table_nullable_fields_accept_none(self):
        """Table-level: job_id, bucket, response_json, error accept None."""
        from src.adapters.db.process_repository import AuditLogLlmTable

        now = datetime.now(timezone.utc).isoformat()
        row = AuditLogLlmTable(
            id=uuid.uuid4(),
            process_id=uuid.uuid4(),
            job_id=None,
            bucket=None,
            response_json=None,
            error=None,
            created_at=now,
        )
        assert row.job_id is None
        assert row.bucket is None
        assert row.response_json is None
        assert row.error is None


# ---------------------------------------------------------------------------
# Repository method tests
# ---------------------------------------------------------------------------

class TestInsertAuditLogLlm:
    @pytest.mark.asyncio
    async def test_insert_audit_log_returns_entity_on_success(self):
        """Happy path: insert_audit_log_llm returns the AuditLogLLM entity."""
        from src.adapters.db.process_repository import ProcessRepository
        from src.domain.entities.audit_log import AuditLogLLM

        repo = ProcessRepository.__new__(ProcessRepository)
        repo._engine = MagicMock()

        audit_in = AuditLogLLM(process_id=uuid.uuid4(), model="claude-3")

        # Q: Why an explicit async context manager instead of MagicMock?
        # A: `async with AsyncSession(...)` requires __aenter__/__aexit__ to be
        #    coroutines; a plain MagicMock fails the awaitable contract.
        # Decision: Use a minimal FakeSession that implements the full async CM
        # protocol and records the row passed to add().
        added_rows = []

        class FakeSession:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

            def add(self, row):
                added_rows.append(row)

            async def commit(self):
                pass

            async def refresh(self, row):
                pass

        with patch(
            "src.adapters.db.process_repository.AsyncSession",
            return_value=FakeSession(),
        ):
            result = await repo.insert_audit_log_llm(audit_in)

        assert result.process_id == audit_in.process_id
        assert result.model == "claude-3"
        # The row was actually persisted, not swallowed.
        assert len(added_rows) == 1

    @pytest.mark.asyncio
    async def test_insert_audit_log_does_not_raise_on_db_error(self):
        """Q: What happens when the DB write fails?
        A: The method must NEVER raise — it logs and swallows.
        This is the critical spec requirement: audit must not break generation.
        """
        from src.adapters.db.process_repository import ProcessRepository
        from src.domain.entities.audit_log import AuditLogLLM

        repo = ProcessRepository.__new__(ProcessRepository)
        repo._engine = MagicMock()

        audit_in = AuditLogLLM(process_id=uuid.uuid4())

        class FakeSession:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

            def add(self, row):
                raise RuntimeError("connection lost")

            async def commit(self):
                pass

            async def refresh(self, row):
                pass

        with patch(
            "src.adapters.db.process_repository.AsyncSession",
            return_value=FakeSession(),
        ):
            # Must NOT raise.
            result = await repo.insert_audit_log_llm(audit_in)

        # On swallow, returns the original entity passed in (best-effort).
        assert result.process_id == audit_in.process_id

    @pytest.mark.asyncio
    async def test_insert_audit_log_serializes_payload_as_json_string(self):
        """The repo stores request_payload (dict) as a JSON string in the table."""
        import json as _json

        from src.adapters.db.process_repository import ProcessRepository
        from src.domain.entities.audit_log import AuditLogLLM

        repo = ProcessRepository.__new__(ProcessRepository)
        repo._engine = MagicMock()

        payload = {"prompt": "p", "seq": 2}
        audit_in = AuditLogLLM(process_id=uuid.uuid4(), request_payload=payload)

        added_rows = []

        class FakeSession:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *exc):
                return False

            def add(self, row):
                added_rows.append(row)

            async def commit(self):
                pass

            async def refresh(self, row):
                pass

        with patch(
            "src.adapters.db.process_repository.AsyncSession",
            return_value=FakeSession(),
        ):
            await repo.insert_audit_log_llm(audit_in)

        assert len(added_rows) == 1
        assert _json.loads(added_rows[0].request_payload) == payload
        assert added_rows[0].status == audit_in.status.value