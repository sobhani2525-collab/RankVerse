"""add admin curation columns to user_lists

Revision ID: e5b1d7c3a9f2
Revises: a7c2e9f1b3d5
Create Date: 2026-10-03

Adds is_featured / featured_at / featured_order (home-page featured lists),
is_hidden_from_discovery (kept out of /lists, home and sitemap but still
reachable by link), and curated_by_admin_id / curation_note. Every column
is nullable or defaulted, so existing rows are untouched.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e5b1d7c3a9f2"
down_revision = "a7c2e9f1b3d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_lists", sa.Column("is_featured", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("user_lists", sa.Column("featured_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_lists", sa.Column("featured_order", sa.Integer(), nullable=True))
    op.add_column(
        "user_lists",
        sa.Column("is_hidden_from_discovery", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column("user_lists", sa.Column("curated_by_admin_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("user_lists", sa.Column("curation_note", sa.String(length=500), nullable=True))
    op.create_foreign_key(
        "fk_user_lists_curated_by_admin_id",
        "user_lists",
        "admin_accounts",
        ["curated_by_admin_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_user_lists_featured",
        "user_lists",
        ["featured_order"],
        postgresql_where=sa.text("is_featured"),
    )


def downgrade() -> None:
    op.drop_index("ix_user_lists_featured", table_name="user_lists")
    op.drop_constraint("fk_user_lists_curated_by_admin_id", "user_lists", type_="foreignkey")
    op.drop_column("user_lists", "curation_note")
    op.drop_column("user_lists", "curated_by_admin_id")
    op.drop_column("user_lists", "is_hidden_from_discovery")
    op.drop_column("user_lists", "featured_order")
    op.drop_column("user_lists", "featured_at")
    op.drop_column("user_lists", "is_featured")
