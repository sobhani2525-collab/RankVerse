"""pool ("winner stays") battles: battles.mode and battle_picks

Revision ID: d8a1e6b2c4f7
Revises: c5f2a8d9e1b3
Create Date: 2026-10-20

Existing battles (tournaments) keep mode 'tournament'.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d8a1e6b2c4f7"
down_revision: Union[str, None] = "c5f2a8d9e1b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("battles", sa.Column("mode", sa.String(length=10), server_default="tournament", nullable=False))
    op.create_check_constraint("ck_battles_mode", "battles", "mode IN ('tournament', 'pool')")

    op.create_table(
        "battle_picks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("battle_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("entity_lo", sa.UUID(), nullable=False),
        sa.Column("entity_hi", sa.UUID(), nullable=False),
        sa.Column("winner_entity_id", sa.UUID(), nullable=False),
        sa.Column("delta_lo", sa.Float(), server_default="0", nullable=False),
        sa.Column("delta_hi", sa.Float(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["battle_id"], ["battles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_lo"], ["entities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_hi"], ["entities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["winner_entity_id"], ["entities.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("battle_id", "user_id", "entity_lo", "entity_hi", name="uq_battle_picks_pair"),
    )
    op.create_index("ix_battle_picks_battle", "battle_picks", ["battle_id"])
    op.create_index("ix_battle_picks_user_id", "battle_picks", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_battle_picks_user_id", table_name="battle_picks")
    op.drop_index("ix_battle_picks_battle", table_name="battle_picks")
    op.drop_table("battle_picks")
    op.drop_constraint("ck_battles_mode", "battles", type_="check")
    op.drop_column("battles", "mode")
