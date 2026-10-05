"""add users.email_verified_at

Revision ID: b4e8d2a6c1f3
Revises: a7c3e9d4b1f6
Create Date: 2026-10-05

NULL means the address hasn't been confirmed yet. Accounts that exist when
this runs are marked verified: they predate email confirmation, and the
column is only informational (nothing is blocked on it), so no current user
is nagged or locked out.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b4e8d2a6c1f3"
down_revision: Union[str, None] = "a7c3e9d4b1f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE users SET email_verified_at = now()")


def downgrade() -> None:
    op.drop_column("users", "email_verified_at")
