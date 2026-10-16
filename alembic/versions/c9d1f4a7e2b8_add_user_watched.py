"""add user_watched ("تماشا کرده‌ام")

Revision ID: c9d1f4a7e2b8
Revises: b7e2d4a9c1f3
Create Date: 2026-10-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c9d1f4a7e2b8"
down_revision: Union[str, None] = "b7e2d4a9c1f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_watched",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "entity_id", name="uq_user_entity_watched"),
    )
    op.create_index(op.f("ix_user_watched_user_id"), "user_watched", ["user_id"], unique=False)
    op.create_index(op.f("ix_user_watched_entity_id"), "user_watched", ["entity_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_watched_entity_id"), table_name="user_watched")
    op.drop_index(op.f("ix_user_watched_user_id"), table_name="user_watched")
    op.drop_table("user_watched")
