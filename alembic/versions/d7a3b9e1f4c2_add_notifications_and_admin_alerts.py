"""add notifications, notification_preferences and admin_alerts

Revision ID: d7a3b9e1f4c2
Revises: c9d1f4a7e2b8
Create Date: 2026-10-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "d7a3b9e1f4c2"
down_revision: Union[str, None] = "c9d1f4a7e2b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("recipient_id", sa.UUID(), nullable=False),
        sa.Column("actor_id", sa.UUID(), nullable=True),
        sa.Column("type", sa.String(length=40), nullable=False),
        sa.Column("target_type", sa.String(length=40), nullable=False),
        sa.Column("target_id", sa.UUID(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("aggregate_key", sa.String(length=120), nullable=True),
        sa.Column("actor_count", sa.Integer(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["recipient_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_notifications_recipient_read_created", "notifications",
        ["recipient_id", "is_read", sa.text("created_at DESC")],
    )
    op.create_index(
        "uq_notifications_unread_aggregate", "notifications", ["recipient_id", "aggregate_key"],
        unique=True, postgresql_where=sa.text("is_read = false AND aggregate_key IS NOT NULL"),
    )
    op.create_index(
        "ix_notifications_unread_recipient", "notifications", ["recipient_id"],
        postgresql_where=sa.text("is_read = false"),
    )

    op.create_table(
        "notification_preferences",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("type", sa.String(length=40), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "type", name="uq_notification_pref_user_type"),
    )
    op.create_index(op.f("ix_notification_preferences_user_id"), "notification_preferences", ["user_id"])

    op.create_table(
        "admin_alerts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("severity", sa.String(length=10), nullable=False),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("fingerprint", sa.String(length=200), nullable=False),
        sa.Column("occurrences", sa.Integer(), nullable=False),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by", sa.UUID(), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["acknowledged_by"], ["admin_accounts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_admin_alerts_open_fingerprint", "admin_alerts", ["fingerprint"],
        unique=True, postgresql_where=sa.text("resolved_at IS NULL"),
    )
    op.create_index("ix_admin_alerts_status_seen", "admin_alerts", ["resolved_at", sa.text("last_seen_at DESC")])


def downgrade() -> None:
    op.drop_index("ix_admin_alerts_status_seen", table_name="admin_alerts")
    op.drop_index("uq_admin_alerts_open_fingerprint", table_name="admin_alerts")
    op.drop_table("admin_alerts")
    op.drop_index(op.f("ix_notification_preferences_user_id"), table_name="notification_preferences")
    op.drop_table("notification_preferences")
    op.drop_index("ix_notifications_unread_recipient", table_name="notifications")
    op.drop_index("uq_notifications_unread_aggregate", table_name="notifications")
    op.drop_index("ix_notifications_recipient_read_created", table_name="notifications")
    op.drop_table("notifications")
