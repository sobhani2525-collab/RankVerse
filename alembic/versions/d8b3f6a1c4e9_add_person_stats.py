"""add person_stats summary table

Revision ID: d8b3f6a1c4e9
Revises: c5f9e3b7d2a4
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "d8b3f6a1c4e9"
down_revision = "c5f9e3b7d2a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "person_stats",
        sa.Column("person_id", UUID(as_uuid=True), sa.ForeignKey("entities.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("role", sa.String(20), primary_key=True),
        sa.Column("origin", sa.String(20), primary_key=True),
        sa.Column("works", sa.Integer(), nullable=False),
        sa.Column("scored", sa.Integer(), nullable=False),
        sa.Column("avg_score", sa.Float(), nullable=True),
        sa.Column("shrunk", sa.Float(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_person_stats_works", "person_stats", ["role", "origin", sa.text("works DESC"), "person_id"])
    op.create_index(
        "ix_person_stats_shrunk", "person_stats", ["role", "origin", sa.text("shrunk DESC"), "person_id"],
        postgresql_where=sa.text("scored >= 3"),
    )


def downgrade() -> None:
    op.drop_index("ix_person_stats_shrunk", table_name="person_stats")
    op.drop_index("ix_person_stats_works", table_name="person_stats")
    op.drop_table("person_stats")
