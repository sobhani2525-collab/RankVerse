"""add taste dna tables (derived data layer)

Revision ID: f3a8c1d92b6e
Revises: 4bc171305309
Create Date: 2026-09-12

Adds the five user_taste_* / user_contribution_stats tables. These are a
derived data layer only — populated later by a background job from
votes/battles/relationships — so no other schema changes are needed.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f3a8c1d92b6e'
down_revision: Union[str, None] = '4bc171305309'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('user_taste_snapshots',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('label', sa.String(length=120), nullable=False),
    sa.Column('model_confidence', sa.Float(), nullable=False),
    sa.Column('entity_scope', sa.String(length=30), server_default='movie', nullable=False),
    sa.Column('computed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('model_version', sa.String(length=20), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.CheckConstraint('model_confidence >= 0 AND model_confidence <= 1', name='ck_taste_snapshot_confidence_range')
    )
    op.create_index(op.f('ix_user_taste_snapshots_user_id'), 'user_taste_snapshots', ['user_id'], unique=False)

    op.create_table('user_taste_dimensions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('dimension_type', sa.String(length=30), nullable=False),
    sa.Column('dimension_key', sa.String(length=60), nullable=False),
    sa.Column('score', sa.Float(), nullable=False),
    sa.Column('confidence', sa.Float(), nullable=False),
    sa.Column('sample_size', sa.Integer(), server_default='0', nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'dimension_type', 'dimension_key', name='uq_taste_dimension_user_type_key'),
    sa.CheckConstraint('score >= 0 AND score <= 100', name='ck_taste_dimension_score_range'),
    sa.CheckConstraint('confidence >= 0 AND confidence <= 1', name='ck_taste_dimension_confidence_range')
    )
    op.create_index(op.f('ix_user_taste_dimensions_user_id'), 'user_taste_dimensions', ['user_id'], unique=False)
    op.create_index('ix_taste_dimensions_user_confidence', 'user_taste_dimensions', ['user_id', 'confidence'], unique=False)

    op.create_table('user_taste_anchors',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('entity_id', sa.UUID(), nullable=False),
    sa.Column('anchor_strength', sa.String(length=20), nullable=False),
    sa.Column('match_score', sa.Float(), nullable=False),
    sa.Column('rank', sa.Integer(), nullable=False),
    sa.Column('computed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['entity_id'], ['entities.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'entity_id', name='uq_taste_anchor_user_entity')
    )
    op.create_index(op.f('ix_user_taste_anchors_user_id'), 'user_taste_anchors', ['user_id'], unique=False)
    op.create_index(op.f('ix_user_taste_anchors_entity_id'), 'user_taste_anchors', ['entity_id'], unique=False)

    op.create_table('user_taste_insights',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('insight_text', sa.Text(), nullable=False),
    sa.Column('insight_tags', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('generated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('stale', sa.Boolean(), server_default=sa.false(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_taste_insights_user_id'), 'user_taste_insights', ['user_id'], unique=False)

    op.create_table('user_contribution_stats',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('votes_count', sa.Integer(), server_default='0', nullable=False),
    sa.Column('battles_count', sa.Integer(), server_default='0', nullable=False),
    sa.Column('comments_count', sa.Integer(), server_default='0', nullable=False),
    sa.Column('relationships_discovered', sa.Integer(), server_default='0', nullable=False),
    sa.Column('contribution_score', sa.Float(), server_default='0.0', nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id')
    )


def downgrade() -> None:
    op.drop_table('user_contribution_stats')

    op.drop_index(op.f('ix_user_taste_insights_user_id'), table_name='user_taste_insights')
    op.drop_table('user_taste_insights')

    op.drop_index(op.f('ix_user_taste_anchors_entity_id'), table_name='user_taste_anchors')
    op.drop_index(op.f('ix_user_taste_anchors_user_id'), table_name='user_taste_anchors')
    op.drop_table('user_taste_anchors')

    op.drop_index('ix_taste_dimensions_user_confidence', table_name='user_taste_dimensions')
    op.drop_index(op.f('ix_user_taste_dimensions_user_id'), table_name='user_taste_dimensions')
    op.drop_table('user_taste_dimensions')

    op.drop_index(op.f('ix_user_taste_snapshots_user_id'), table_name='user_taste_snapshots')
    op.drop_table('user_taste_snapshots')
