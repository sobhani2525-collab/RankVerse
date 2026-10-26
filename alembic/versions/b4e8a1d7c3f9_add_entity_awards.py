"""entity awards: won/nominated results for titles and people

Revision ID: b4e8a1d7c3f9
Revises: a7d2e9c4f1b8
Create Date: 2026-10-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b4e8a1d7c3f9"
down_revision: Union[str, None] = "a7d2e9c4f1b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "entity_awards",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("entity_id", sa.UUID(), sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("award", sa.String(length=40), nullable=False),
        sa.Column("category", sa.String(length=200), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("for_entity_id", sa.UUID(), sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=True),
        sa.UniqueConstraint(
            "entity_id", "award", "category", "year", "for_entity_id",
            name="uq_entity_awards_result", postgresql_nulls_not_distinct=True,
        ),
    )
    op.create_index("ix_entity_awards_entity_id", "entity_awards", ["entity_id"])
    op.create_index("ix_entity_awards_award", "entity_awards", ["award"])


def downgrade() -> None:
    op.drop_index("ix_entity_awards_award", table_name="entity_awards")
    op.drop_index("ix_entity_awards_entity_id", table_name="entity_awards")
    op.drop_table("entity_awards")
