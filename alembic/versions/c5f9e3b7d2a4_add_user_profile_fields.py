"""add users.display_name, bio, avatar_key

Revision ID: c5f9e3b7d2a4
Revises: b4e8d2a6c1f3
Create Date: 2026-10-05

All three are optional and NULL for existing accounts: the site falls back to
the username and a letter avatar. avatar_key picks one of the preset avatars
the frontend ships (there is no file storage), and the API validates it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c5f9e3b7d2a4"
down_revision: Union[str, None] = "b4e8d2a6c1f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("display_name", sa.String(length=50), nullable=True))
    op.add_column("users", sa.Column("bio", sa.String(length=300), nullable=True))
    op.add_column("users", sa.Column("avatar_key", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_key")
    op.drop_column("users", "bio")
    op.drop_column("users", "display_name")
