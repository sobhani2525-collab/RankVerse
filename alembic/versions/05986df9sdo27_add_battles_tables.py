"""add battles module tables (pair_votes, entity_elo_scores)

Revision ID: 05986df9sdo27_add_battles_tables
Revises: 806336d33ba8
Create Date: 2026-09-06

This version is self-healing: it drops any leftover objects from
previous failed attempts before recreating them, so it's safe to
re-run even after a partial failure.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "05986df9sdo27_add_battles_tables"
down_revision = "806336d33ba8"  # keep whatever value you already confirmed works
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    # Clean up any leftovers from previous partial/failed runs so this
    # migration can always be re-run safely.
    bind.execute(sa.text("DROP TABLE IF EXISTS pair_votes CASCADE"))
    bind.execute(sa.text("DROP TABLE IF EXISTS entity_elo_scores CASCADE"))
    bind.execute(sa.text("DROP TYPE IF EXISTS vote_outcome"))

    # Create the enum type exactly once via raw SQL, then reference it
    # with create_type=False so create_table() below does NOT try to
    # create it a second time.
    bind.execute(
        sa.text("CREATE TYPE vote_outcome AS ENUM ('left', 'right', 'skip')")
    )
    vote_outcome_enum = postgresql.ENUM(
        "left", "right", "skip", name="vote_outcome", create_type=False
    )

    op.create_table(
        "pair_votes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column(
            "left_item",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("entities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "right_item",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("entities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("winner", vote_outcome_enum, nullable=False),
        sa.Column("left_score_before", sa.Float(), nullable=False, server_default="1200"),
        sa.Column("right_score_before", sa.Float(), nullable=False, server_default="1200"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint("left_item != right_item", name="ck_pair_votes_distinct_items"),
    )
    op.create_index("ix_pair_votes_user_id", "pair_votes", ["user_id"])
    op.create_index("ix_pair_votes_category", "pair_votes", ["category"])
    op.create_index("ix_pair_votes_created_at", "pair_votes", ["created_at"])

    op.create_table(
        "entity_elo_scores",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "entity_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("entities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("elo_score", sa.Float(), nullable=False, server_default="1200"),
        sa.Column("matches_played", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("entity_id", "category", name="uq_entity_elo_entity_category"),
    )
    op.create_index("ix_entity_elo_scores_entity_id", "entity_elo_scores", ["entity_id"])
    op.create_index("ix_entity_elo_scores_category", "entity_elo_scores", ["category"])


def downgrade() -> None:
    op.drop_index("ix_entity_elo_scores_category", table_name="entity_elo_scores")
    op.drop_index("ix_entity_elo_scores_entity_id", table_name="entity_elo_scores")
    op.drop_table("entity_elo_scores")

    op.drop_index("ix_pair_votes_created_at", table_name="pair_votes")
    op.drop_index("ix_pair_votes_category", table_name="pair_votes")
    op.drop_index("ix_pair_votes_user_id", table_name="pair_votes")
    op.drop_table("pair_votes")

    op.get_bind().execute(sa.text("DROP TYPE IF EXISTS vote_outcome"))
