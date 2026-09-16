"""Add source_reflections and verse_notes columns to day_passage.

Revision ID: d1a2b3c4d5e6
Revises: 4be44a0a2a37
Create Date: 2026-09-13 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d1a2b3c4d5e6"
down_revision = "4be44a0a2a37"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "day_passage",
        sa.Column(
            "source_reflections",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.add_column(
        "day_passage",
        sa.Column(
            "verse_notes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("day_passage", "source_reflections")
    op.drop_column("day_passage", "verse_notes")
