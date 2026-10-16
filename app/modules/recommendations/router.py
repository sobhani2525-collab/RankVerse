import uuid
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.cache import cached
from app.core import database as _database
from app.core.database import get_read_db
from app.modules.entities.repository import EntityRepository
from app.modules.recommendations.schemas import RelatedEntityOut

router = APIRouter(prefix="/entities", tags=["recommendations"])


def build_reason(shared: list) -> str:
    directors = [t for rel_type, t in shared if rel_type == "directed_by"]
    actors = [t for rel_type, t in shared if rel_type == "acted_in"]
    genres = [t for rel_type, t in shared if rel_type == "has_genre"]

    parts = []
    if directors:
        parts.append(f"هر دو را {directors[0]} کارگردانی کرده")
    if actors:
        names = " و ".join(actors[:2])
        parts.append(f"{names} در هر دو بازی کرده")
    if genres:
        names = "، ".join(genres[:3])
        parts.append(f"ژانر مشترک: {names}")

    if not parts:
        return "بر اساس شباهت کلی در گراف دانش"
    return " • ".join(parts)


@router.get("/{entity_id}/related")
async def get_related_entities(
    entity_id: uuid.UUID,
    limit: int = 6,
    db: AsyncSession = Depends(get_read_db),
):
    return await cached(
        ("related", entity_id, limit),
        settings.cache_ttl_lists,
        lambda: _related_entities(db, entity_id, limit),
    )


# How many titles a genre set's pool keeps: the caller's limit plus room for
# the entity itself and its similar_to picks, which are filtered out afterwards.
_POOL_HEADROOM = 24


def _is_persian(entity) -> bool:
    attrs = entity.attributes or {}
    return attrs.get("original_language") == "fa" or attrs.get("country") == "IR"


async def _same_genre_pool(
    repo: EntityRepository, entity_id: uuid.UUID, entity_type: str, limit: int, persian: bool
) -> list:
    """The best same-type titles for this entity's genre set. Computing them
    aggregates every title in those genres (seconds for a big genre), but the
    answer is the same for every title with that genre set, so it is cached
    per (type, genre set) instead of recomputed per title."""
    genre_ids = await repo.genre_ids_of(entity_id)
    if not genre_ids:
        return []
    size = limit + _POOL_HEADROOM

    async def load():
        async with _database.background_read_session() as db:
            found = await EntityRepository(db).top_by_shared_genres(genre_ids, entity_type, size, persian)
        # Plain data only: nothing ORM-bound outlives the session it came from.
        return [
            SimpleNamespace(id=e.id, entity_type=e.entity_type, title=e.title, slug=e.slug, attributes=dict(e.attributes or {}))
            for e in found
        ]

    return await cached(
        ("similar-genres", entity_type, persian, tuple(sorted(str(g) for g in genre_ids)), size),
        settings.cache_ttl_similar, load, stale_for=settings.cache_stale_seconds,
    )


async def _related_entities(db: AsyncSession, entity_id: uuid.UUID, limit: int):
    repo = EntityRepository(db)
    entity = await repo.get_by_id(entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    edges = await repo.get_related(entity_id, relation_type="similar_to", limit=limit)

    # Fallback: the similar_to graph (scripts/build_similarity_graph.py)
    # only links entities with >=2 shared connections, so a title with
    # sparse director/cast data -- common for smaller/regional titles in
    # this catalog -- can clear zero or few of them, leaving this section
    # empty far more often than it should be. Top up with same-genre,
    # same-type entities ranked by score so the section (almost) always
    # has something to show, without ever duplicating a similar_to pick.
    fallback_entities = []
    if len(edges) < limit:
        skip = {entity_id, *(edge.to_entity.id for edge in edges)}
        pool = await _same_genre_pool(repo, entity_id, entity.entity_type, limit, _is_persian(entity))
        fallback_entities = [e for e in pool if e.id not in skip][: limit - len(edges)]

    # Every pick's "why" in one query rather than one per pick.
    shared = await repo.get_shared_connections_many(
        entity_id, [edge.to_entity.id for edge in edges] + [e.id for e in fallback_entities]
    )

    items = [
        RelatedEntityOut(
            id=str(edge.to_entity.id),
            title=edge.to_entity.title,
            slug=edge.to_entity.slug,
            entity_type=edge.to_entity.entity_type,
            weight=edge.weight,
            relation_type=edge.relation_type,
            poster_path=edge.to_entity.attributes.get("poster_path"),
            year=edge.to_entity.attributes.get("year"),
            title_fa=edge.to_entity.attributes.get("title_fa"),
            reason=build_reason(shared[edge.to_entity.id]),
        )
        for edge in edges
    ]
    items += [
        RelatedEntityOut(
            id=str(fallback_entity.id),
            title=fallback_entity.title,
            slug=fallback_entity.slug,
            entity_type=fallback_entity.entity_type,
            # Lower than a real similar_to weight (max ~0.6, see
            # build_similarity_graph.py) so these visibly read as a
            # softer match than a genuine similar_to pick.
            weight=0.35,
            relation_type="same_genre",
            poster_path=fallback_entity.attributes.get("poster_path"),
            year=fallback_entity.attributes.get("year"),
            title_fa=fallback_entity.attributes.get("title_fa"),
            reason=build_reason(shared[fallback_entity.id]),
        )
        for fallback_entity in fallback_entities
    ]

    return {"data": [item.model_dump() for item in items], "meta": None, "error": None}
