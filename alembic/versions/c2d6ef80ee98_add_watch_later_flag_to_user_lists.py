"""add watch-later flag to user_lists

Revision ID: c2d6ef80ee98
Revises: b7e4d2a9c1f0
Create Date: 2026-09-25

Adds is_watch_later (default false) plus a partial unique index enforcing
at most one such system list per user. The list itself is created lazily
per user on first bookmark toggle -- no backfill needed here.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "c2d6ef80ee98"
down_revision = "b7e4d2a9c1f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_lists",
        sa.Column("is_watch_later", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_index(
        "uq_user_lists_one_watch_later",
        "user_lists",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_watch_later"),
    )


def downgrade() -> None:
    op.drop_index("uq_user_lists_one_watch_later", table_name="user_lists")
    op.drop_column("user_lists", "is_watch_later")
