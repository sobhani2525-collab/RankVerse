"""drop redundant entities.slug index

Revision ID: 4bc171305309
Revises: 02be394ea78e
Create Date: 2026-09-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '4bc171305309'
down_revision: Union[str, None] = '02be394ea78e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # entities.slug already has unique=True, which Postgres backs with its
    # own unique index. The separate non-unique ix_entities_slug index
    # added in the baseline migration is redundant with that.
    op.drop_index("ix_entities_slug", table_name="entities")


def downgrade() -> None:
    op.create_index("ix_entities_slug", "entities", ["slug"])
