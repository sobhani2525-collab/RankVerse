"""contact messages: the public contact form's inbox for admins

Revision ID: a7d2e9c4f1b8
Revises: f1c6d3a8b7e2
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a7d2e9c4f1b8"
down_revision: Union[str, None] = "f1c6d3a8b7e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "contact_messages",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("category", sa.String(length=20), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("page_url", sa.String(length=500), nullable=True),
        sa.Column("user_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=300), nullable=True),
        sa.Column("status", sa.String(length=10), server_default="new", nullable=False),
        sa.Column("admin_note", sa.String(length=1000), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by", sa.UUID(), sa.ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_contact_messages_status_created", "contact_messages", ["status", sa.text("created_at DESC")])


def downgrade() -> None:
    op.drop_index("ix_contact_messages_status_created", table_name="contact_messages")
    op.drop_table("contact_messages")
