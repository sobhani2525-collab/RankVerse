"""user follows: who follows whom

Revision ID: c5f2a9e1d8b3
Revises: b4e8a1d7c3f9
Create Date: 2026-10-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c5f2a9e1d8b3"
down_revision: Union[str, None] = "b4e8a1d7c3f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_follows",
        sa.Column("follower_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("followee_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("follower_id <> followee_id", name="ck_user_follow_not_self"),
    )
    op.create_index("ix_user_follows_followee_id", "user_follows", ["followee_id"])


def downgrade() -> None:
    op.drop_index("ix_user_follows_followee_id", table_name="user_follows")
    op.drop_table("user_follows")
