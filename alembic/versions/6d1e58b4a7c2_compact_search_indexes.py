"""Index title searches that ignore spaces.

Revision ID: 6d1e58b4a7c2
Revises: c5f2a9e1d8b3
"""
from alembic import op

revision = "6d1e58b4a7c2"
down_revision = "c5f2a9e1d8b3"
branch_labels = None
depends_on = None

INDEXES = {
    "ix_entities_title_compact_trgm": "title",
    "ix_entities_title_fa_compact_trgm": "attributes ->> 'title_fa'",
}


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for name, source in INDEXES.items():
            expression = f"replace(translate({source}, 'يىكةۀأإآ‌', 'ییکههااا '), ' ', '')"
            # Rebuild on retry in case an interrupted concurrent build left an invalid index.
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
            op.execute(f"CREATE INDEX CONCURRENTLY {name} ON entities USING gin (({expression}) gin_trgm_ops)")


def downgrade() -> None:
    with op.get_context().autocommit_block():
        for name in INDEXES:
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
