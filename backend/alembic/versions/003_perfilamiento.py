"""Perfilamiento wizard — module/answers/analysis columns + nullable iso_standard.

Revision ID: 003_perfilamiento
Revises: 002_task_workflow
Create Date: 2026-10-07

Adds the perfilamiento data model to ``processes``:

- ``perfilamiento_module``  VARCHAR(20) — selected need (optimizacion/sst/nts/sos/planificacion)
- ``perfilamiento_answers`` TEXT DEFAULT '{}' — adaptive questionnaire answers (JSON)
- ``analysis_result``       TEXT DEFAULT '{}' — LLM output (cost/time/plan/pain points) (JSON)

Makes ``iso_standard`` nullable (``nts``/``planificacion`` do not map to a single
ISO) and backfills ``perfilamiento_module`` from the existing ``iso_standard`` for
brownfield rows. Idempotent guards mirror 001/002 (``IF NOT EXISTS`` /
``ADD COLUMN IF NOT EXISTS``).
"""

from typing import Sequence, Union

from alembic import op


revision: str = "003_perfilamiento"
down_revision: Union[str, None] = "002_task_workflow"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE processes
            ADD COLUMN IF NOT EXISTS perfilamiento_module VARCHAR(20)
    """)
    op.execute("""
        ALTER TABLE processes
            ADD COLUMN IF NOT EXISTS perfilamiento_answers TEXT NOT NULL DEFAULT '{}'
    """)
    op.execute("""
        ALTER TABLE processes
            ADD COLUMN IF NOT EXISTS analysis_result TEXT NOT NULL DEFAULT '{}'
    """)
    op.execute("ALTER TABLE processes ALTER COLUMN iso_standard DROP NOT NULL")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_processes_perfilamiento_module "
        "ON processes (perfilamiento_module)"
    )

    # Brownfield backfill: map existing ISO rows to their module (mirrors
    # ISO_TO_MODULE in process.py). NULL-rows only, so re-running is a no-op.
    op.execute("""
        UPDATE processes SET perfilamiento_module = 'optimizacion'
        WHERE perfilamiento_module IS NULL AND iso_standard = 'iso9001'
    """)
    op.execute("""
        UPDATE processes SET perfilamiento_module = 'sst'
        WHERE perfilamiento_module IS NULL AND iso_standard = 'iso45001'
    """)
    op.execute("""
        UPDATE processes SET perfilamiento_module = 'sos'
        WHERE perfilamiento_module IS NULL AND iso_standard = 'iso14001'
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_processes_perfilamiento_module")
    op.execute("ALTER TABLE processes DROP COLUMN IF EXISTS analysis_result")
    op.execute("ALTER TABLE processes DROP COLUMN IF EXISTS perfilamiento_answers")
    op.execute("ALTER TABLE processes DROP COLUMN IF EXISTS perfilamiento_module")
    op.execute("ALTER TABLE processes ALTER COLUMN iso_standard SET NOT NULL")
