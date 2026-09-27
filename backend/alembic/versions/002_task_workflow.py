"""Kanban task workflow — department/status columns + task_comments table.

Revision ID: 002_task_workflow
Revises: 001_initial
Create Date: 2026-09-26

Adds the kanban columns to ``tasks`` and the per-task comment table. Mirrors the
brownfield-safe, idempotent style of 001_initial (``IF NOT EXISTS`` guards) so it
can be applied to a live database without erroring on pre-existing columns.

- ``tasks.department`` (VARCHAR(100), default '')  — responsible department
- ``tasks.status``    (VARCHAR(20),  default 'pending') — kanban column
- ``task_comments``   — per-task comments (id, task_id, author_id, body, created_at)

No FK constraint on ``task_comments.task_id`` (index only), matching the existing
schema's convention (see TaskTable.plan_id and 001_initial's lack of REFERENCES).
"""

from typing import Sequence, Union

from alembic import op


revision: str = "002_task_workflow"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE tasks
            ADD COLUMN IF NOT EXISTS department VARCHAR(100) NOT NULL DEFAULT ''
    """)
    op.execute("""
        ALTER TABLE tasks
            ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'
    """)
    op.execute("""
        CREATE TABLE IF NOT EXISTS task_comments (
            id         UUID        PRIMARY KEY,
            task_id    UUID        NOT NULL,
            author_id  UUID        NOT NULL,
            body       TEXT        NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_task_comments_task_id ON task_comments (task_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS task_comments")
    op.execute("ALTER TABLE tasks DROP COLUMN IF EXISTS status")
    op.execute("ALTER TABLE tasks DROP COLUMN IF EXISTS department")
