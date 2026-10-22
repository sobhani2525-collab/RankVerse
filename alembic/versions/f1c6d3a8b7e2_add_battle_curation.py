"""battle curation: featured / hidden flags for admin-curated battles

Revision ID: f1c6d3a8b7e2
Revises: d8a1e6b2c4f7
Create Date: 2026-10-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f1c6d3a8b7e2"
down_revision: Union[str, None] = "d8a1e6b2c4f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("battles", sa.Column("is_featured", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("battles", sa.Column("featured_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("battles", sa.Column("featured_order", sa.Integer(), nullable=True))
    op.add_column("battles", sa.Column("is_hidden_from_discovery", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("battles", sa.Column("curation_note", sa.String(length=500), nullable=True))
    op.add_column("battles", sa.Column("curated_by_admin_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_battles_curated_by_admin", "battles", "admin_accounts", ["curated_by_admin_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_battles_featured", "battles", ["is_featured", "featured_order"])


def downgrade() -> None:
    op.drop_index("ix_battles_featured", table_name="battles")
    op.drop_constraint("fk_battles_curated_by_admin", "battles", type_="foreignkey")
    op.drop_column("battles", "curated_by_admin_id")
    op.drop_column("battles", "curation_note")
    op.drop_column("battles", "is_hidden_from_discovery")
    op.drop_column("battles", "featured_order")
    op.drop_column("battles", "featured_at")
    op.drop_column("battles", "is_featured")
