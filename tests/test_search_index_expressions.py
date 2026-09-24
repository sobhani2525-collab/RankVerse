"""
Guards the link between GET /search's SQL and the trigram indexes from
migration b7e4d2a9c1f0: Postgres only uses an expression index when the
query's expression is the same one the index was built on. If someone edits
the fold map (or how title_fa is read) in app/modules/search/router.py, this
fails until a new migration rebuilds the indexes to match.

Pure unit test -- no database needed.
"""
import importlib.util
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.dialects import postgresql

from app.modules.entities.models import Entity
from app.modules.search.router import _FOLD_FROM, _FOLD_TO, _fold_sql, _title_fa_sql

_MIGRATION = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "b7e4d2a9c1f0_trigram_indexes_for_search.py"


def _load_migration():
    spec = importlib.util.spec_from_file_location("trigram_migration", _MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _render(expr) -> str:
    # The index is defined on the bare column; the query qualifies it.
    return str(expr.compile(dialect=postgresql.dialect())).replace("entities.", "")


def test_fold_strings_match_the_migration():
    migration = _load_migration()
    assert migration.FOLD_FROM == _FOLD_FROM
    assert migration.FOLD_TO == _FOLD_TO


def test_query_expressions_match_the_index_expressions():
    migration = _load_migration()
    assert _render(_fold_sql(Entity.title)) == migration.TITLE_EXPR
    assert _render(_fold_sql(_title_fa_sql())) == migration.TITLE_FA_EXPR


def test_folded_expressions_carry_no_bind_parameters():
    """Bound fold strings would stop Postgres matching the indexes."""
    stmt = select(Entity.id).where(_fold_sql(Entity.title).ilike("%x%"), _fold_sql(_title_fa_sql()).ilike("%x%"))
    params = stmt.compile(dialect=postgresql.dialect()).params
    # Only the two ILIKE patterns should be parameters.
    assert sorted(params.values()) == ["%x%", "%x%"]
