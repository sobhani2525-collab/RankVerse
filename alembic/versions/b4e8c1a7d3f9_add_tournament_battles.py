"""add tournament battles (battles, participants, matches, votes, follows)

Revision ID: b4e8c1a7d3f9
Revises: d7a3b9e1f4c2
Create Date: 2026-10-20

New tables only; the pairwise Elo battles (pair_votes, entity_elo_scores) and
daily battles are untouched.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b4e8c1a7d3f9"
down_revision: Union[str, None] = "d7a3b9e1f4c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "battles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.String(length=8), nullable=False),
        sa.Column("creator_id", sa.UUID(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("cover_url", sa.String(length=500), nullable=True),
        sa.Column("entity_type", sa.String(length=30), nullable=False),
        sa.Column("bracket_size", sa.Integer(), nullable=False),
        sa.Column("visibility", sa.String(length=10), server_default="draft", nullable=False),
        sa.Column("status", sa.String(length=10), server_default="draft", nullable=False),
        sa.Column("is_official", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("round_duration_seconds", sa.Integer(), nullable=True),
        sa.Column("current_round", sa.Integer(), server_default="0", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("winner_entity_id", sa.UUID(), nullable=True),
        sa.Column("seed_value", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["creator_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["winner_entity_id"], ["entities.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("slug"),
        sa.CheckConstraint("bracket_size IN (4, 8, 16)", name="ck_battles_bracket_size"),
        sa.CheckConstraint("visibility IN ('draft', 'unlisted', 'public')", name="ck_battles_visibility"),
        sa.CheckConstraint("status IN ('draft', 'active', 'completed', 'archived')", name="ck_battles_status"),
    )
    op.create_index("ix_battles_creator", "battles", ["creator_id", "status"])
    op.create_index("ix_battles_public_listing", "battles", ["visibility", "status", "created_at"])
    op.create_index("ix_battles_active_due", "battles", ["status", "current_round"])

    op.create_table(
        "battle_participants",
        sa.Column("battle_id", sa.UUID(), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("seed", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("battle_id", "entity_id"),
        sa.ForeignKeyConstraint(["battle_id"], ["battles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("battle_id", "seed", name="uq_battle_participants_seed"),
    )
    op.create_index("ix_battle_participants_entity", "battle_participants", ["entity_id"])

    op.create_table(
        "battle_matches",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("battle_id", sa.UUID(), nullable=False),
        sa.Column("round", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("entity_a_id", sa.UUID(), nullable=True),
        sa.Column("entity_b_id", sa.UUID(), nullable=True),
        sa.Column("winner_entity_id", sa.UUID(), nullable=True),
        sa.Column("opens_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closes_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=10), server_default="pending", nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["battle_id"], ["battles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_a_id"], ["entities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_b_id"], ["entities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["winner_entity_id"], ["entities.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("battle_id", "round", "position", name="uq_battle_matches_slot"),
        sa.CheckConstraint("status IN ('pending', 'open', 'closed')", name="ck_battle_matches_status"),
    )

    op.create_table(
        "battle_votes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("match_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("chosen_entity_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["match_id"], ["battle_matches.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chosen_entity_id"], ["entities.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("match_id", "user_id", name="uq_battle_votes_match_user"),
    )
    op.create_index("ix_battle_votes_user_id", "battle_votes", ["user_id"])

    op.create_table(
        "battle_follows",
        sa.Column("battle_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("battle_id", "user_id"),
        sa.ForeignKeyConstraint(["battle_id"], ["battles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_battle_follows_user_id", "battle_follows", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_battle_follows_user_id", table_name="battle_follows")
    op.drop_table("battle_follows")
    op.drop_index("ix_battle_votes_user_id", table_name="battle_votes")
    op.drop_table("battle_votes")
    op.drop_table("battle_matches")
    op.drop_index("ix_battle_participants_entity", table_name="battle_participants")
    op.drop_table("battle_participants")
    op.drop_index("ix_battles_active_due", table_name="battles")
    op.drop_index("ix_battles_public_listing", table_name="battles")
    op.drop_index("ix_battles_creator", table_name="battles")
    op.drop_table("battles")
