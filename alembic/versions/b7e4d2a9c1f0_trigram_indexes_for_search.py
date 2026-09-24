"""trigram indexes for GET /search

Revision ID: b7e4d2a9c1f0
Revises: a3c7e1d9b2f4
Create Date: 2026-09-24

GET /search (app/modules/search/router.py) matches
    translate(title, FOLD_FROM, FOLD_TO)                 ILIKE '%term%'
    translate(attributes ->> 'title_fa', FOLD_FROM, ...) ILIKE '%term%'
A leading-wildcard ILIKE can't use a btree, so after the TMDb catalog
import (~62k entities) every search was a full scan computing translate()
on every row -- measured 3s to 60s+ on prod. GIN trigram indexes on those
exact expressions let Postgres answer it from the index (for terms of 3+
characters; shorter terms still scan, as trigrams need 3 characters).

The expressions below must stay identical to what the router renders
(its fold strings and the 'title_fa' key are inlined as literals for that
reason) -- tests/test_search_index_expressions.py checks it.

Built CONCURRENTLY so the entities table stays writable. If a concurrent
build fails part-way it leaves an INVALID index behind; drop it
(DROP INDEX CONCURRENTLY <name>) before re-running, since IF NOT EXISTS
would otherwise skip it.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7e4d2a9c1f0"
down_revision: Union[str, None] = "a3c7e1d9b2f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Frozen copy of app/modules/search/router.py's _FOLD_FROM / _FOLD_TO
# (Arabic-keyboard letters and the ZWNJ half-space -> Persian/plain forms).
FOLD_FROM = "يىكةۀأإآ‌"
FOLD_TO = "ییکههااا "

TITLE_EXPR = f"translate(title, '{FOLD_FROM}', '{FOLD_TO}')"
TITLE_FA_EXPR = f"translate(attributes ->> 'title_fa', '{FOLD_FROM}', '{FOLD_TO}')"

INDEXES = {
    "ix_entities_title_folded_trgm": TITLE_EXPR,
    "ix_entities_title_fa_folded_trgm": TITLE_FA_EXPR,
}


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    with op.get_context().autocommit_block():
        for name, expr in INDEXES.items():
            op.execute(f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {name} ON entities USING gin (({expr}) gin_trgm_ops)")


def downgrade() -> None:
    # pg_trgm is left installed: dropping an extension is database-wide and
    # something else may come to rely on it.
    with op.get_context().autocommit_block():
        for name in INDEXES:
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
