"""Initial baseline — all 9 tables.

Revision ID: 001_initial
Revises:
Create Date: 2026-09-22

All tables already exist in production (brownfield). This migration is
idempotent via CREATE TABLE IF NOT EXISTS / ALTER TABLE IF NOT EXISTS so it
is safe to stamp on the live DB.  It establishes alembic's head without
re-creating anything.  Future schema changes use autogenerate.

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ────────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id      UUID        PRIMARY KEY,
            role         VARCHAR     NOT NULL,
            email        VARCHAR(255) NOT NULL UNIQUE,
            full_name    VARCHAR(100) NOT NULL,
            gov_id       VARCHAR(20)  NOT NULL,
            created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
            is_active    BOOLEAN      NOT NULL DEFAULT TRUE
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_email ON users (email)")

    # ── company ──────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS company (
            company_id     UUID         PRIMARY KEY,
            user_id        UUID         NOT NULL,
            business_type  VARCHAR(50)  NOT NULL,
            is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
            name           VARCHAR(200),
            contact_name   VARCHAR(100),
            contact_email  VARCHAR(255),
            contact_phone  VARCHAR(30)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_company_user_id ON company (user_id)")

    # ── consultant ───────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS consultant (
            consultant_id    UUID        PRIMARY KEY,
            user_id         UUID       NOT NULL,
            years_experience INTEGER    NOT NULL DEFAULT 0,
            certifications  VARCHAR(200) NOT NULL DEFAULT ''
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_consultant_user_id ON consultant (user_id)")

    # ── processes ────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS processes (
            id             UUID        PRIMARY KEY,
            consultant_id  UUID        NOT NULL,
            company_id     UUID        NOT NULL,
            pre_diagnosis  TEXT        NOT NULL DEFAULT '{}',
            iso_standard   VARCHAR(20) NOT NULL,
            status         VARCHAR(20) NOT NULL DEFAULT 'in_diagnosis',
            created_at     TIMESTAMPTZ NOT NULL,
            updated_at     TIMESTAMPTZ NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_processes_consultant_id ON processes (consultant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_processes_company_id    ON processes (company_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_processes_iso_standard  ON processes (iso_standard)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_processes_status        ON processes (status)")

    # ── findings ────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS findings (
            id          UUID        PRIMARY KEY,
            process_id  UUID        NOT NULL UNIQUE,
            answers     TEXT        NOT NULL DEFAULT '{}',
            free_text   TEXT        NOT NULL DEFAULT '',
            updated_at  TIMESTAMPTZ NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_findings_process_id ON findings (process_id)")

    # ── plans ───────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS plans (
            id           UUID        PRIMARY KEY,
            process_id   UUID        NOT NULL UNIQUE,
            summary_md   TEXT        NOT NULL DEFAULT '',
            generated_at TIMESTAMPTZ NOT NULL,
            updated_at   TEXT        NOT NULL DEFAULT '',
            revision     INTEGER     NOT NULL DEFAULT 0
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_plans_process_id ON plans (process_id)")

    # ── tasks ───────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id              UUID        PRIMARY KEY,
            plan_id         UUID        NOT NULL,
            title           VARCHAR(200) NOT NULL,
            description     TEXT        NOT NULL DEFAULT '',
            priority       VARCHAR(10)  NOT NULL DEFAULT 'medium',
            estimated_effort VARCHAR(100) NOT NULL DEFAULT '',
            owner_role     VARCHAR(100) NOT NULL DEFAULT '',
            sort_order     INTEGER       NOT NULL DEFAULT 0,
            source_clause   TEXT        NOT NULL DEFAULT '',
            require_document BOOLEAN     NOT NULL DEFAULT FALSE,
            document_title VARCHAR(200)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_tasks_plan_id ON tasks (plan_id)")

    # ── audit_logs_llm ─────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs_llm (
            id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
            process_id      UUID         NOT NULL,
            job_id          UUID,
            bucket          VARCHAR(10),
            attempt         INTEGER      NOT NULL DEFAULT 1,
            model           VARCHAR(50)  NOT NULL DEFAULT '',
            iso_standard    VARCHAR(20)  NOT NULL DEFAULT '',
            request_payload TEXT         NOT NULL DEFAULT '{}',
            response_json   TEXT,
            input_tokens    INTEGER      NOT NULL DEFAULT 0,
            output_tokens   INTEGER      NOT NULL DEFAULT 0,
            latency_ms      INTEGER      NOT NULL DEFAULT 0,
            status          VARCHAR(20)  NOT NULL DEFAULT 'success',
            error           TEXT,
            created_at      TEXT         NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_llm_process_id ON audit_logs_llm (process_id)")

    # ── plan_jobs ────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS plan_jobs (
            process_id             UUID        PRIMARY KEY,
            consultant_id          UUID        NOT NULL,
            status                VARCHAR(20) NOT NULL DEFAULT 'queued',
            error                 TEXT,
            segments              TEXT        NOT NULL DEFAULT '{}',
            failed_attempts       INTEGER     NOT NULL DEFAULT 0,
            findings_snapshot     TEXT        NOT NULL DEFAULT '{}',
            pre_diagnosis_snapshot TEXT       NOT NULL DEFAULT '{}',
            source_updated_at     TEXT        NOT NULL DEFAULT '',
            completed_count       INTEGER     NOT NULL DEFAULT 0,
            created_at            TIMESTAMPTZ NOT NULL,
            updated_at            TIMESTAMPTZ NOT NULL
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_plan_jobs_consultant_id ON plan_jobs (consultant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_plan_jobs_status        ON plan_jobs (status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS plan_jobs")
    op.execute("DROP TABLE IF EXISTS audit_logs_llm")
    op.execute("DROP TABLE IF EXISTS tasks")
    op.execute("DROP TABLE IF EXISTS plans")
    op.execute("DROP TABLE IF EXISTS findings")
    op.execute("DROP TABLE IF EXISTS processes")
    op.execute("DROP TABLE IF EXISTS consultant")
    op.execute("DROP TABLE IF EXISTS company")
    op.execute("DROP TABLE IF EXISTS users")
