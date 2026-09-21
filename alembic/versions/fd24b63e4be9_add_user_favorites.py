"""add user_favorites (♥) + user_contribution_stats.favorites_count

Revision ID: fd24b63e4be9
Revises: ccf13541a965
Create Date: 2026-09-21

A ♥ favorite is a deliberately lighter-weight, separate signal from
UserRating (see UserFavorite's docstring in app/modules/users/models.py
and TasteDimensionComputer._favorited_unrated_genre_slugs_for_user) --
not a shortcut for "rate 5 stars". This adds its table plus the
favorites_count column ContributionStatsComputer now writes alongside
votes_count/battles_count/comments_count.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "fd24b63e4be9"
down_revision: Union[str, None] = "ccf13541a965"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_favorites",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "entity_id", name="uq_user_entity_favorite"),
    )
    op.create_index(op.f("ix_user_favorites_user_id"), "user_favorites", ["user_id"], unique=False)
    op.create_index(op.f("ix_user_favorites_entity_id"), "user_favorites", ["entity_id"], unique=False)

    op.add_column(
        "user_contribution_stats",
        sa.Column("favorites_count", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("user_contribution_stats", "favorites_count")
    op.drop_index(op.f("ix_user_favorites_entity_id"), table_name="user_favorites")
    op.drop_index(op.f("ix_user_favorites_user_id"), table_name="user_favorites")
    op.drop_table("user_favorites")
