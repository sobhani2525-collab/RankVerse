"""add entity_comments (comments on person pages)

Revision ID: a7c2e9f1b3d5
Revises: d4f1a8c3b2e7
Create Date: 2026-10-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a7c2e9f1b3d5"
down_revision: Union[str, None] = "d4f1a8c3b2e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "entity_comments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_entity_comments_entity_id"), "entity_comments", ["entity_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_entity_comments_entity_id"), table_name="entity_comments")
    op.drop_table("entity_comments")
