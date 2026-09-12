"""drop user_contribution_stats.relationships_discovered

Revision ID: 7a8921b4e876
Revises: f3a8c1d92b6e
Create Date: 2026-09-12

user_contribution_stats had no writer anywhere in the app (see
ContributionStatsComputer, added in this same change, for the other
three columns' first real writer). relationships_discovered specifically
has no feature behind it at all -- there's no concept anywhere in the
product of a user submitting or discovering a graph relationship, edges
only ever come from TMDb sync -- so it's dropped rather than computed.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '7a8921b4e876'
down_revision: Union[str, None] = 'f3a8c1d92b6e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('user_contribution_stats', 'relationships_discovered')


def downgrade() -> None:
    op.add_column(
        'user_contribution_stats',
        sa.Column('relationships_discovered', sa.Integer(), server_default='0', nullable=False),
    )
