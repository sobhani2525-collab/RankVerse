"""add score_delta_a/b to battle_matches (Elo effect of a tournament match)

Revision ID: c5f2a8d9e1b3
Revises: b4e8c1a7d3f9
Create Date: 2026-10-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c5f2a8d9e1b3"
down_revision: Union[str, None] = "b4e8c1a7d3f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("battle_matches", sa.Column("score_delta_a", sa.Float(), nullable=True))
    op.add_column("battle_matches", sa.Column("score_delta_b", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("battle_matches", "score_delta_b")
    op.drop_column("battle_matches", "score_delta_a")
