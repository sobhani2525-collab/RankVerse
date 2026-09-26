from fastapi import APIRouter, Depends, Query
from sqlalchemy import Text, case, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_read_db
from app.core.schemas import envelope
from app.modules.entities.models import Entity
from app.modules.entities.service import _extract_media

router = APIRouter(tags=["search"])

# Persian text is typed inconsistently: Arabic keyboards produce ي/ك instead
# of Persian ی/ک, آ/أ/إ are often typed as plain ا, and the half-space (ZWNJ)
# in e.g. "می‌خواهم" is often typed as a regular space or left out. Both the
# query and the stored titles are folded through the same char-by-char map
# so any of these variants still match.
_FOLD_FROM = "يىكةۀأإآ‌"
_FOLD_TO = "ییکههااا "
_FOLD_TABLE = str.maketrans(_FOLD_FROM, _FOLD_TO)


# The fold strings and the title_fa key are inlined as SQL literals, not
# bind parameters: Postgres only matches an expression index against
# constants, and the trigram indexes from migration b7e4d2a9c1f0 are built on
# exactly what _fold_sql(Entity.title) and _fold_sql(_title_fa_sql()) render
# to. Change the fold map here and those indexes silently stop being used --
# add a migration that rebuilds them (tests/test_search_index_expressions.py
# checks the two stay in sync).
def _sql_literal(value: str):
    return literal_column("'" + value.replace("'", "''") + "'", type_=Text)


def _fold_sql(expr):
    return func.translate(expr, _sql_literal(_FOLD_FROM), _sql_literal(_FOLD_TO), type_=Text)


def _title_fa_sql():
    return Entity.attributes.op("->>", return_type=Text)(_sql_literal("title_fa"))


def _escape_like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\%").replace("_", "\_")


async def find_entities_by_title(
    db: AsyncSession, q: str, entity_type: str | None, limit: int
) -> list[Entity]:
    """ILIKE on the entity's English title and its Persian title
    (attributes.title_fa), prefix matches first -- shared by /search and the
    list add-item candidates (ListService.get_candidates)."""
    term = _escape_like(" ".join(q.translate(_FOLD_TABLE).split()))
    if not term:
        return []

    title = _fold_sql(Entity.title)
    title_fa = _fold_sql(_title_fa_sql())

    stmt = select(Entity).where(
        or_(title.ilike(f"%{term}%"), title_fa.ilike(f"%{term}%"))
    )
    if entity_type:
        stmt = stmt.where(Entity.entity_type == entity_type)
    stmt = stmt.order_by(
        case(
            (or_(title.ilike(f"{term}%"), title_fa.ilike(f"{term}%")), 0),
            else_=1,
        ),
        func.length(Entity.title),
    ).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.get("/search")
async def search(
    q: str = Query(min_length=1),
    type: str | None = Query(None, alias="type"),
    limit: int = Query(20, le=50),
    db: AsyncSession = Depends(get_read_db),
):
    """
    MVP search: ILIKE on the entity's English title and its Persian title
    (attributes.title_fa, see sync/normalizer.py's _persian_title), with
    prefix matches ranked ahead of mid-word ones.
    Post-MVP: replace with Postgres full-text search (tsvector) or a dedicated
    search engine once catalog size and query volume justify it.

    type is optional and scopes the search to one entity_type (e.g. adding
    an item to a movie-only list) -- omitting it searches across every
    entity_type, which is what the global site search box does.
    """
    entities = await find_entities_by_title(db, q, type, limit)

    return envelope(
        data=[
            {
                "id": str(e.id),
                "slug": e.slug,
                "title": e.title,
                "title_fa": (e.attributes or {}).get("title_fa"),
                "type": e.entity_type,
                "image_url": _extract_media(e.attributes).image_url,
            }
            for e in entities
        ]
    )
