"""add admin_accounts table

Revision ID: c1a9e4f2b7d3
Revises: 7a8921b4e876
Create Date: 2026-09-13

A table fully separate from `users` — admin accounts are platform-operator
access to the /admin panel, not part of the public knowledge graph or user
profile. See scripts/seed_admin.py for creating the first super_admin.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c1a9e4f2b7d3'
down_revision: Union[str, None] = '7a8921b4e876'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'admin_accounts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=30), server_default='super_admin', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email', name='uq_admin_accounts_email'),
    )
    op.create_index(op.f('ix_admin_accounts_email'), 'admin_accounts', ['email'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_admin_accounts_email'), table_name='admin_accounts')
    op.drop_table('admin_accounts')
