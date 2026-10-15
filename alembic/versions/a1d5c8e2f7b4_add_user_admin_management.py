"""admin user management: user state columns + admin_audit_logs

Revision ID: a1d5c8e2f7b4
Revises: e9c4a7d2b5f1
Create Date: 2026-10-15

Adds last_login_at / blocked_* / deleted_at / admin_note to users, trigram
indexes for the admin user search, and the append-only admin_audit_logs table.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a1d5c8e2f7b4"
down_revision = "e9c4a7d2b5f1"
branch_labels = None
depends_on = None

TRGM = {
    "ix_users_email_trgm": "lower(email)",
    "ix_users_username_trgm": "lower(username)",
    "ix_users_display_name_trgm": "lower(coalesce(display_name, ''))",
}


def upgrade() -> None:
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("blocked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("blocked_reason", sa.String(300), nullable=True))
    op.add_column("users", sa.Column("blocked_by_admin_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("admin_note", sa.Text(), nullable=True))
    op.create_index("ix_users_created_at", "users", ["created_at"])
    op.create_index("ix_users_last_login_at", "users", ["last_login_at"])
    op.create_index("ix_users_deleted_at", "users", ["deleted_at"])

    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    for name, expr in TRGM.items():
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON users USING gin (({expr}) gin_trgm_ops)")

    op.create_table(
        "admin_audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("admin_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("admin_email", sa.String(255), nullable=False),
        sa.Column("action", sa.String(60), nullable=False),
        sa.Column("target_type", sa.String(40), nullable=False),
        sa.Column("target_id", sa.String(64), nullable=False),
        sa.Column("before", postgresql.JSONB(), nullable=True),
        sa.Column("after", postgresql.JSONB(), nullable=True),
        sa.Column("ip", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_admin_audit_logs_target", "admin_audit_logs", ["target_type", "target_id"])
    op.create_index("ix_admin_audit_logs_action", "admin_audit_logs", ["action"])
    op.create_index("ix_admin_audit_logs_created_at", "admin_audit_logs", ["created_at"])
    op.create_index("ix_admin_audit_logs_admin_id", "admin_audit_logs", ["admin_id"])


def downgrade() -> None:
    op.drop_table("admin_audit_logs")
    for name in TRGM:
        op.execute(f"DROP INDEX IF EXISTS {name}")
    op.drop_index("ix_users_deleted_at", table_name="users")
    op.drop_index("ix_users_last_login_at", table_name="users")
    op.drop_index("ix_users_created_at", table_name="users")
    for col in ("admin_note", "deleted_at", "blocked_by_admin_id", "blocked_reason", "blocked_at", "last_login_at"):
        op.drop_column("users", col)
