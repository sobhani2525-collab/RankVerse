"""Picks a theme (genre + actor, or genre + decade) and the best-ranked movies
that really match it. Shared by the daily auto lists and the daily auto battles,
so both are built from the knowledge graph itself, never invented.
"""
import random
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auto_lists.texts import GENRE_FA, decade_label
from app.modules.entities.models import Entity, EntityRanking, PersonStats, RelationshipEdge

DECADES = (1970, 1980, 1990, 2000, 2010)
# Actors with at least this many credited works are candidates.
MIN_ACTOR_WORKS = 12
ACTOR_POOL = 200


@dataclass
class Theme:
    kind: str  # "actor" | "decade"
    key: str  # stable identity, used to avoid repeating a theme
    genre_fa: str
    person_fa: str | None
    decade: int | None
    tags: list[str]
    movies: list[Entity]  # best-ranked first


IsUsed = Callable[[str, list[str]], Awaitable[bool]]


async def _genres(db: AsyncSession) -> list[Entity]:
    stmt = select(Entity).where(Entity.entity_type == "genre", func.lower(Entity.title).in_(list(GENRE_FA)))
    return list((await db.execute(stmt)).scalars().all())


def _ranked_movies(stmt, limit: int):
    return (
        stmt.outerjoin(EntityRanking, EntityRanking.entity_id == Entity.id)
        .where(Entity.entity_type == "movie", EntityRanking.computed_score.is_not(None))
        .order_by(EntityRanking.computed_score.desc(), Entity.title)
        .limit(limit)
    )


async def actor_genre_movies(db: AsyncSession, person_id: uuid.UUID, genre_id: uuid.UUID, limit: int) -> list[Entity]:
    """Best-ranked movies in which `person_id` acted (cast credit only) and
    that carry the genre."""
    acted = select(RelationshipEdge.from_entity_id).where(
        RelationshipEdge.to_entity_id == person_id, RelationshipEdge.relation_type == "acted_in"
    )
    tagged = select(RelationshipEdge.from_entity_id).where(
        RelationshipEdge.to_entity_id == genre_id, RelationshipEdge.relation_type == "has_genre"
    )
    stmt = select(Entity).where(Entity.id.in_(acted), Entity.id.in_(tagged))
    return list((await db.execute(_ranked_movies(stmt, limit))).scalars().all())


async def decade_genre_movies(db: AsyncSession, genre_id: uuid.UUID, decade: int, limit: int) -> list[Entity]:
    tagged = select(RelationshipEdge.from_entity_id).where(
        RelationshipEdge.to_entity_id == genre_id, RelationshipEdge.relation_type == "has_genre"
    )
    stmt = select(Entity).where(
        Entity.id.in_(tagged),
        Entity.attributes["year"].as_integer().between(decade, decade + 9),
    )
    return list((await db.execute(_ranked_movies(stmt, limit))).scalars().all())


async def pick_actor(db: AsyncSession, rng: random.Random) -> Entity | None:
    """A well-known actor with a Persian name, from the people ranking table."""
    stmt = (
        select(Entity)
        .join(PersonStats, PersonStats.person_id == Entity.id)
        .where(
            PersonStats.role == "actor", PersonStats.origin == "all",
            PersonStats.works >= MIN_ACTOR_WORKS,
            Entity.attributes["title_fa"].as_string().is_not(None),
        )
        .order_by(PersonStats.works.desc())
        .limit(ACTOR_POOL)
    )
    people = list((await db.execute(stmt)).scalars().all())
    return rng.choice(people) if people else None


async def find_theme(
    db: AsyncSession, rng: random.Random, *, min_items: int, pool_size: int, is_used: IsUsed
) -> Theme | None:
    """One attempt: a random theme with at least `min_items` matching movies
    (up to `pool_size`, best first) that `is_used` hasn't already seen; None
    when this attempt found nothing usable."""
    genres = await _genres(db)
    if not genres:
        return None
    genre = rng.choice(genres)
    genre_fa = GENRE_FA[genre.title.lower()]

    if rng.random() < 0.7:
        person = await pick_actor(db, rng)
        if person is None:
            return None
        name = (person.attributes or {}).get("title_fa")
        tags = [genre_fa, name]
        key = f"a:{person.id}:{genre.id}"
        if await is_used(key, tags):
            return None
        movies = await actor_genre_movies(db, person.id, genre.id, pool_size)
        if len(movies) < min_items:
            return None
        return Theme("actor", key, genre_fa, name, None, tags, movies)

    decade = rng.choice(DECADES)
    tags = [genre_fa, f"دهه {decade_label(decade)}"]
    key = f"d:{genre.id}:{decade}"
    if await is_used(key, tags):
        return None
    movies = await decade_genre_movies(db, genre.id, decade, pool_size)
    if len(movies) < min_items:
        return None
    return Theme("decade", key, genre_fa, None, decade, tags, movies)
