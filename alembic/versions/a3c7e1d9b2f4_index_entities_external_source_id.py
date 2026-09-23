"""index entities (external_source, external_id)

Revision ID: a3c7e1d9b2f4
Revises: fd24b63e4be9
Create Date: 2026-09-23

Every sync does several EntityRepository.get_by_external_id lookups per
title (the title itself plus each director/cast member), which were
sequential scans -- fine at ~1.6k entities, not after the full TMDb
catalog import (scripts/import_tmdb_catalog.py) takes the table past
100k rows.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3c7e1d9b2f4"
down_revision: Union[str, None] = "fd24b63e4be9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_entities_external_source_external_id",
        "entities",
        ["external_source", "external_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_entities_external_source_external_id", table_name="entities")
