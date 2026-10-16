"""Needs-certification flag — ISO certification is a deferred user decision.

Revision ID: 004_needs_certification
Revises: 003_perfilamiento
Create Date: 2026-10-08

ISO certification is NOT derived from the perfilamiento module at creation time
anymore. Instead the user marks whether the process needs certification up
front, and the concrete ISO standard is chosen later at a certification step
(out of scope here). ``needs_certification`` defaults to false (not needed).
Idempotent guards mirror 001/002/003 (``ADD COLUMN IF NOT EXISTS``).
"""

from typing import Sequence, Union

from alembic import op


revision: str = "004_needs_certification"
down_revision: Union[str, None] = "003_perfilamiento"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE processes
            ADD COLUMN IF NOT EXISTS needs_certification BOOLEAN NOT NULL DEFAULT false
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE processes
            DROP COLUMN IF EXISTS needs_certification
    """)
