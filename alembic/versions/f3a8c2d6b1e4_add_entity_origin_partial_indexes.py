"""partial indexes for the Persian / foreign title split

Revision ID: f3a8c2d6b1e4
Revises: e5b1d7c3a9f2
Create Date: 2026-10-03

GET /rankings/people (and the other origin-filtered lists) filter entities by
the "Persian work" predicate from entities/repository.py::_persian_work.
With no index on it Postgres seq-scanned all of entities (~460ms of the
~790ms query). These partial indexes cover exactly that predicate and its
negation, so the planner can read only the matching ids. Built CONCURRENTLY
so writes aren't blocked.
"""
from alembic import op

revision = "f3a8c2d6b1e4"
down_revision = "e5b1d7c3a9f2"
branch_labels = None
depends_on = None

PERSIAN = "COALESCE((((attributes ->> 'original_language') = 'fa') OR ((attributes ->> 'country') = 'IR')), false)"


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(f"CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_entities_persian_work ON entities (id) WHERE {PERSIAN}")
        op.execute(f"CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_entities_foreign_work ON entities (id) WHERE NOT {PERSIAN}")


def downgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_entities_foreign_work")
        op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_entities_persian_work")
