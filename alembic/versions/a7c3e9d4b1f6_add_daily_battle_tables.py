"""add daily battle tables

Revision ID: a7c3e9d4b1f6
Revises: f3a8c2d6b1e4
Create Date: 2026-10-03

Two new tables, nothing existing is touched:
  - daily_battles: one movie pair per Tehran calendar day (unique battle_date)
  - daily_battle_votes: one vote per user or guest per day, enforced by two
    partial unique indexes
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "a7c3e9d4b1f6"
down_revision = "f3a8c2d6b1e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "daily_battles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("battle_date", sa.Date(), nullable=False),
        sa.Column("left_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("right_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("theme_kind", sa.String(20), nullable=False, server_default="pair"),
        sa.Column("theme_value", sa.String(200), nullable=False, server_default=""),
        sa.Column("left_votes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("right_votes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("source", sa.String(10), nullable=False, server_default="auto"),
        sa.Column(
            "created_by_admin_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("battle_date", name="uq_daily_battles_battle_date"),
        sa.CheckConstraint("left_id != right_id", name="ck_daily_battles_distinct_items"),
    )
    op.create_table(
        "daily_battle_votes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "daily_battle_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("daily_battles.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("guest_id", sa.String(64), nullable=True),
        sa.Column("choice", sa.String(5), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "(user_id IS NOT NULL AND guest_id IS NULL) OR (user_id IS NULL AND guest_id IS NOT NULL)",
            name="ck_daily_battle_votes_one_voter",
        ),
        sa.CheckConstraint("choice IN ('left', 'right')", name="ck_daily_battle_votes_choice"),
    )
    op.create_index(
        "uq_daily_battle_votes_user", "daily_battle_votes", ["daily_battle_id", "user_id"],
        unique=True, postgresql_where=sa.text("user_id IS NOT NULL"),
    )
    op.create_index(
        "uq_daily_battle_votes_guest", "daily_battle_votes", ["daily_battle_id", "guest_id"],
        unique=True, postgresql_where=sa.text("guest_id IS NOT NULL"),
    )
    op.create_index("ix_daily_battle_votes_user_created", "daily_battle_votes", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_daily_battle_votes_user_created", table_name="daily_battle_votes")
    op.drop_index("uq_daily_battle_votes_guest", table_name="daily_battle_votes")
    op.drop_index("uq_daily_battle_votes_user", table_name="daily_battle_votes")
    op.drop_table("daily_battle_votes")
    op.drop_table("daily_battles")
