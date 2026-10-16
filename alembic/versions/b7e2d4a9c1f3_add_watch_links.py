"""add watch_links (where to watch: Iranian streaming services)

Revision ID: b7e2d4a9c1f3
Revises: a1d5c8e2f7b4
Create Date: 2026-10-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b7e2d4a9c1f3"
down_revision: Union[str, None] = "a1d5c8e2f7b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "watch_links",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("url", sa.String(1000), nullable=False),
        sa.Column("access_type", sa.String(20), server_default="subscription", nullable=False),
        sa.Column("is_affiliate", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("source", sa.String(20), server_default="manual", nullable=False),
        sa.Column("click_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entity_id", "provider", name="uq_watch_link_entity_provider"),
    )
    op.create_index(op.f("ix_watch_links_entity_id"), "watch_links", ["entity_id"], unique=False)
    op.create_index("ix_watch_links_provider", "watch_links", ["provider"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_watch_links_provider", table_name="watch_links")
    op.drop_index(op.f("ix_watch_links_entity_id"), table_name="watch_links")
    op.drop_table("watch_links")
