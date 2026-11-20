import math
from collections.abc import Sequence
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Text, case, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_read_db
from app.core.schemas import envelope
from app.modules.entities.models import Entity, EntityRanking, RelationshipEdge
from app.modules.entities.service import _extract_media

router = APIRouter(tags=["search"])

# Persian text is typed inconsistently: Arabic keyboards produce ي/ك instead
# of Persian ی/ک, آ/أ/إ are often typed as plain ا, and the half-space (ZWNJ)
# can be typed as a regular space. Tolerant search also ignores missing spaces.
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


def _compact_sql(expr):
    return func.replace(expr, _sql_literal(" "), _sql_literal(""), type_=Text)


def _escape_like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


CANDIDATE_FACTOR = 5  # candidates fetched per result wanted, then re-ranked by popularity
MIN_CANDIDATES = 100
PERSON_CREDITS_CAP = 30  # credits beyond this don't make a person more "popular"


def popularity(entity: Entity, score: float | None, credits: int) -> float:
    """0-10 prominence used to order results within the same match quality:
    a title's ranking score, or a person's credit count scaled onto the same range."""
    if entity.entity_type == "person":
        # Log scale: the 5th credit matters far more than the 25th, and a
        # director with a dozen films should compete with a well-rated title.
        return math.log1p(min(credits, PERSON_CREDITS_CAP)) / math.log1p(PERSON_CREDITS_CAP) * 10
    return score or 0.0


def rerank(rows: list[tuple[Entity, int, float]], limit: int) -> list[Entity]:
    """rows: (entity, match_tier, popularity). Better match tier first, then
    more prominent, then shorter title (the old tie-break)."""
    rows = sorted(rows, key=lambda r: (r[1], -r[2], len(r[0].title)))
    return [entity for entity, _, _ in rows[:limit]]


async def find_entities_by_title(
    db: AsyncSession, q: str, entity_type: str | Sequence[str] | None, limit: int,
    *, tolerant: bool = False,
) -> list[Entity]:
    """ILIKE on the entity's English title and its Persian title
    (attributes.title_fa). Matches are tiered -- exact title, then title or a
    word in it starting with the query, then anywhere inside -- and within a
    tier the more prominent entity (ranking score / number of credits) wins,
    so "Nolan" finds Christopher Nolan before an obscure namesake. Shared by
    /search and the list add-item candidates (ListService.get_candidates)."""
    normalized = " ".join(q.translate(_FOLD_TABLE).split())
    if not normalized:
        return []
    term = _escape_like(normalized)

    title = _fold_sql(Entity.title)
    title_fa = _fold_sql(_title_fa_sql())

    tier = case(
        (or_(func.lower(title) == normalized.lower(), func.lower(title_fa) == normalized.lower()), 0),
        (
            or_(
                title.ilike(f"{term}%"), title_fa.ilike(f"{term}%"),
                title.ilike(f"% {term}%"), title_fa.ilike(f"% {term}%"),
            ),
            1,
        ),
        else_=2,
    )

    match = or_(title.ilike(f"%{term}%"), title_fa.ilike(f"%{term}%"))
    core = (
        # Slim columns only: attributes (overview, cast...) is large and the
        # candidate pool is 100+ rows; full entities load for the winners below.
        select(Entity.id, Entity.entity_type, Entity.title, tier.label("tier"), EntityRanking.computed_score)
        .outerjoin(EntityRanking, EntityRanking.entity_id == Entity.id)
    )
    if isinstance(entity_type, str):
        core = core.where(Entity.entity_type == entity_type)
    elif entity_type:
        core = core.where(Entity.entity_type.in_(list(entity_type)))
    candidate_limit = max(limit * CANDIDATE_FACTOR, MIN_CANDIDATES)
    compact = normalized.replace(" ", "")
    if tolerant and len(compact) >= 3:
        compact_pattern = f"%{_escape_like(compact)}%"
        match = or_(match, _compact_sql(title).ilike(compact_pattern), _compact_sql(title_fa).ilike(compact_pattern))
    stmt = core.where(match).order_by(tier, func.length(Entity.title)).limit(candidate_limit)
    candidates = (await db.execute(stmt)).all()
    if not candidates and tolerant and len(compact) >= 4:
        # Postgres's indexed word-similarity operator finds a match within
        # a longer title. Only use it after literal/spacing matches fail.
        similarity = func.greatest(
            func.word_similarity(normalized, title),
            func.word_similarity(normalized, title_fa),
        )
        candidates = (await db.execute(
            core.where(or_(title.bool_op("%>")(normalized), title_fa.bool_op("%>")(normalized)))
            .order_by(similarity.desc(), func.length(Entity.title))
            .limit(limit)
        )).all()
        return await _load_in_order(db, [candidate.id for candidate in candidates])
    if not candidates:
        return []

    people_ids = [c.id for c in candidates if c.entity_type == "person"]
    credits: dict = {}
    if people_ids:
        credit_rows = await db.execute(
            select(RelationshipEdge.to_entity_id, func.count())
            .where(RelationshipEdge.to_entity_id.in_(people_ids))
            .group_by(RelationshipEdge.to_entity_id)
        )
        credits = {pid: n for pid, n in credit_rows.all()}

    ranked = sorted(
        candidates,
        key=lambda c: (
            int(c.tier),
            -popularity(c, c.computed_score, credits.get(c.id, 0)),
            len(c.title),
        ),
    )[:limit]
    return await _load_in_order(db, [c.id for c in ranked])


async def _load_in_order(db: AsyncSession, ids: list[UUID]) -> list[Entity]:
    if not ids:
        return []
    by_id = {e.id: e for e in (await db.execute(select(Entity).where(Entity.id.in_(ids)))).scalars()}
    return [by_id[i] for i in ids if i in by_id]


@router.get("/search")
async def search(
    q: str = Query(min_length=1, max_length=150),
    type: str | None = Query(None, alias="type"),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_read_db),
    scope: Literal["screen"] | None = None,
    tolerant: bool = False,
):
    """Search Persian and original titles. Use scope=screen for film and TV,
    or type for a single entity type. Tolerant mode also checks spacing and typos."""
    entity_type = type or (("movie", "tv_series") if scope == "screen" else None)
    entities = await find_entities_by_title(db, q, entity_type, limit, tolerant=tolerant)

    return envelope(
        data=[
            {
                "id": str(e.id),
                "slug": e.slug,
                "title": e.title,
                "title_fa": (e.attributes or {}).get("title_fa"),
                "type": e.entity_type,
                "year": (e.attributes or {}).get("year") if e.entity_type in ("movie", "tv_series") else None,
                "image_url": _extract_media(e.attributes).image_url,
            }
            for e in entities
        ]
    )
