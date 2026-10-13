"""add relationship and attribute-expression indexes

Revision ID: e9c4a7d2b5f1
Revises: d8b3f6a1c4e9

Covering/ordered indexes for the repeated public queries:
 * relationships (from, relation_type, to) and (to, relation_type, from):
   edge lookups by one end plus type (highlights window query, similar
   titles, collaborators, people credit scan) without touching the heap.
 * entities (entity_type, year) and (entity_type, imdb_rating): the list
   filters/sorts on CAST(attributes ->> 'year' AS INTEGER) and the hero pool's
   IMDb thresholds. Expressions match what SQLAlchemy's JSONB
   .as_integer()/.as_float() render, which is what the queries use.

Built CONCURRENTLY so the tables stay writable. If a concurrent build fails
part-way it leaves an INVALID index behind; DROP INDEX CONCURRENTLY <name>
before re-running, since IF NOT EXISTS would otherwise skip it.
"""
from alembic import op

revision = "e9c4a7d2b5f1"
down_revision = "d8b3f6a1c4e9"
branch_labels = None
depends_on = None

INDEXES = {
    "ix_relationships_from_type_to": "relationships (from_entity_id, relation_type, to_entity_id)",
    "ix_relationships_to_type_from": "relationships (to_entity_id, relation_type, from_entity_id)",
    "ix_entities_type_year": "entities (entity_type, (CAST(attributes ->> 'year' AS INTEGER)))",
    "ix_entities_type_imdb_rating": "entities (entity_type, (CAST(attributes ->> 'imdb_rating' AS FLOAT)))",
}


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for name, definition in INDEXES.items():
            op.execute(f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {name} ON {definition}")


def downgrade() -> None:
    with op.get_context().autocommit_block():
        for name in INDEXES:
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
