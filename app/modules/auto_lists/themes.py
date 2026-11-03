"""Picks a theme and the best-ranked entities that really match it. Shared by
the daily auto lists and the daily auto battles, so both are built from the
knowledge graph itself, never invented.

A theme is one of:
  - actor:  titles (movies, series, or both) of one genre in which one actor appears
  - decade: titles of one genre released in one decade
  - people: the best-ranked actors/directors/series creators of one genre, or of
            Iranian / foreign productions (lists only)
"""
import random
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auto_lists.texts import GENRE_FA, decade_label
from app.modules.entities.models import Entity, EntityRanking, PersonStats, RelationshipEdge
from app.modules.entities.repository import PEOPLE_ROLE_TYPES, shrunk_score
from app.modules.entities.repository import _persian_work as persian_work  # the site's own definition of an Iranian title

DECADES = (1970, 1980, 1990, 2000, 2010, 2020)
# Actors with at least this many credited works are candidates.
MIN_ACTOR_WORKS = 12
# ...and Iranian actors, who have fewer credits on record.
MIN_PERSIAN_ACTOR_WORKS = 6
ACTOR_POOL = 200
# A person needs this many scored credits in the genre to be ranked in it.
MIN_GENRE_CREDITS = 3

# Which entity types each kind of work covers.
WORK_TYPES = {
    "movie": ["movie"],
    "tv_series": ["tv_series"],
    "mixed": ["movie", "tv_series"],
}
# Default mixes: (work kind -> weight).
LIST_WORKS = {"movie": 35, "tv_series": 30, "mixed": 10, "person": 25}
BATTLE_WORKS = {"movie": 55, "tv_series": 45}


@dataclass
class Theme:
    kind: str  # "actor" | "decade" | "people"
    work: str  # "movie" | "tv_series" | "mixed" | "person"
    key: str  # stable identity, used to avoid repeating a theme
    genre_fa: str | None
    person_fa: str | None  # actor themes
    decade: int | None  # decade themes
    role: str | None  # people themes: actor | director | creator
    origin: str | None  # people themes without a genre: persian | foreign
    tags: list[str]
    items: list[Entity]  # best-ranked first
    persian: bool = False  # only Iranian titles / people of Iranian titles

    @property
    def entity_type(self) -> str | None:
        """The list/battle entity_type: one type, or None for a mixed list."""
        if self.work == "mixed":
            return None
        return "person" if self.work == "person" else self.work


IsUsed = Callable[[str, list[str]], Awaitable[bool]]


async def _genres(db: AsyncSession) -> list[Entity]:
    stmt = select(Entity).where(Entity.entity_type == "genre", func.lower(Entity.title).in_(list(GENRE_FA)))
    return list((await db.execute(stmt)).scalars().all())


def _ranked(stmt, types: list[str], limit: int, persian: bool = False):
    stmt = (
        stmt.outerjoin(EntityRanking, EntityRanking.entity_id == Entity.id)
        .where(Entity.entity_type.in_(types), EntityRanking.computed_score.is_not(None))
    )
    if persian:
        stmt = stmt.where(persian_work(Entity))
    return stmt.order_by(EntityRanking.computed_score.desc(), Entity.title).limit(limit)


def _tagged(genre_id: uuid.UUID):
    return select(RelationshipEdge.from_entity_id).where(
        RelationshipEdge.to_entity_id == genre_id, RelationshipEdge.relation_type == "has_genre"
    )


async def actor_genre_titles(
    db: AsyncSession, person_id: uuid.UUID, genre_id: uuid.UUID, types: list[str], limit: int,
    persian: bool = False,
) -> list[Entity]:
    """Best-ranked titles in which `person_id` acted (cast credit only) and
    that carry the genre."""
    acted = select(RelationshipEdge.from_entity_id).where(
        RelationshipEdge.to_entity_id == person_id, RelationshipEdge.relation_type == "acted_in"
    )
    stmt = select(Entity).where(Entity.id.in_(acted), Entity.id.in_(_tagged(genre_id)))
    return list((await db.execute(_ranked(stmt, types, limit, persian))).scalars().all())


async def decade_genre_titles(
    db: AsyncSession, genre_id: uuid.UUID, decade: int, types: list[str], limit: int, persian: bool = False
) -> list[Entity]:
    stmt = select(Entity).where(
        Entity.id.in_(_tagged(genre_id)),
        Entity.attributes["year"].as_integer().between(decade, decade + 9),
    )
    return list((await db.execute(_ranked(stmt, types, limit, persian))).scalars().all())


async def people_in_genre(
    db: AsyncSession, role: str, genre_id: uuid.UUID, limit: int, persian: bool = False
) -> list[Entity]:
    """Best-ranked people of `role` among the credits on titles of the genre
    (Bayesian-shrunk mean of their titles' scores, as the people ranking does);
    with `persian`, only credits on Iranian titles count."""
    inner = (
        select(
            RelationshipEdge.to_entity_id.label("person_id"),
            func.count(EntityRanking.computed_score).label("scored"),
            func.avg(EntityRanking.computed_score).label("avg_score"),
        )
        .join(EntityRanking, EntityRanking.entity_id == RelationshipEdge.from_entity_id)
        .where(
            RelationshipEdge.relation_type.in_(PEOPLE_ROLE_TYPES[role]),
            RelationshipEdge.from_entity_id.in_(_tagged(genre_id)),
        )
    )
    if persian:
        work = aliased(Entity)
        inner = inner.join(work, work.id == RelationshipEdge.from_entity_id).where(persian_work(work))
    credits = (
        inner.group_by(RelationshipEdge.to_entity_id)
        .having(func.count(EntityRanking.computed_score) >= MIN_GENRE_CREDITS)
        .subquery()
    )
    stmt = (
        select(Entity)
        .join(credits, credits.c.person_id == Entity.id)
        .where(Entity.entity_type == "person")
        .order_by(shrunk_score(credits.c.scored, credits.c.avg_score).desc(), Entity.title)
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


async def people_by_origin(db: AsyncSession, role: str, origin: str, limit: int) -> list[Entity]:
    """Best-ranked people of `role` on Iranian ("persian") or foreign titles,
    from the precomputed person_stats table."""
    stmt = (
        select(Entity)
        .join(PersonStats, PersonStats.person_id == Entity.id)
        .where(
            PersonStats.role == role, PersonStats.origin == origin,
            PersonStats.scored >= MIN_GENRE_CREDITS, PersonStats.shrunk.is_not(None),
        )
        .order_by(PersonStats.shrunk.desc(), Entity.title)
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


async def pick_actor(db: AsyncSession, rng: random.Random, persian: bool = False) -> Entity | None:
    """A well-known actor with a Persian name, from the people ranking table;
    with `persian`, one ranked among Iranian titles."""
    stmt = (
        select(Entity)
        .join(PersonStats, PersonStats.person_id == Entity.id)
        .where(
            PersonStats.role == "actor", PersonStats.origin == ("persian" if persian else "all"),
            PersonStats.works >= (MIN_PERSIAN_ACTOR_WORKS if persian else MIN_ACTOR_WORKS),
            Entity.attributes["title_fa"].as_string().is_not(None),
        )
        .order_by(PersonStats.works.desc())
        .limit(ACTOR_POOL)
    )
    people = list((await db.execute(stmt)).scalars().all())
    return rng.choice(people) if people else None


ROLE_TAG_FA = {"actor": "بازیگران", "director": "کارگردان‌ها", "creator": "سازندگان سریال"}


async def _people_theme(
    db: AsyncSession, rng: random.Random, genres: list[Entity], min_items: int, pool_size: int,
    is_used: IsUsed, persian: bool,
) -> Theme | None:
    if rng.random() < 0.55:
        genre = rng.choice(genres)
        genre_fa = GENRE_FA[genre.title.lower()]
        role = rng.choices(["actor", "director", "creator"], weights=[55, 35, 10])[0]
        key = f"p:{role}:genre:{genre.id}" + (":ir" if persian else "")
        tags = [ROLE_TAG_FA[role], genre_fa, *(["ایرانی"] if persian else [])]
        if await is_used(key, tags):
            return None
        items = await people_in_genre(db, role, genre.id, pool_size, persian)
        if len(items) < min_items:
            return None
        return Theme("people", "person", key, genre_fa, None, None, role, None, tags, items, persian)

    role = rng.choice(["actor", "director"])
    origin = "persian" if persian else "foreign"
    key = f"p:{role}:origin:{origin}"
    tags = [ROLE_TAG_FA[role], "ایران" if origin == "persian" else "سینمای جهان"]
    if await is_used(key, tags):
        return None
    items = await people_by_origin(db, role, origin, pool_size)
    if len(items) < min_items:
        return None
    return Theme("people", "person", key, None, None, None, role, origin, tags, items, persian)


async def find_theme(
    db: AsyncSession, rng: random.Random, *, min_items: int, pool_size: int, is_used: IsUsed,
    works: dict[str, int] | None = None, persian_share: float = 0.0,
) -> Theme | None:
    """One attempt: a random theme with at least `min_items` matching entities
    (up to `pool_size`, best first) that `is_used` hasn't already seen; None
    when this attempt found nothing usable. `works` weights the kinds of
    work (see LIST_WORKS / BATTLE_WORKS); `persian_share` is the chance that
    the theme is limited to Iranian titles (or people of Iranian titles)."""
    genres = await _genres(db)
    if not genres:
        return None
    works = works or LIST_WORKS
    work = rng.choices(list(works), weights=list(works.values()))[0]
    persian = rng.random() < persian_share

    if work == "person":
        return await _people_theme(db, rng, genres, min_items, pool_size, is_used, persian)

    types = WORK_TYPES[work]
    genre = rng.choice(genres)
    genre_fa = GENRE_FA[genre.title.lower()]
    extra_tag = [*(["ایرانی"] if persian else []), *{"movie": [], "tv_series": ["سریال"], "mixed": ["فیلم و سریال"]}[work]]
    suffix = ":ir" if persian else ""

    if rng.random() < 0.7:
        person = await pick_actor(db, rng, persian)
        if person is None:
            return None
        name = (person.attributes or {}).get("title_fa")
        tags = [genre_fa, name, *extra_tag]
        key = f"a:{work}:{person.id}:{genre.id}{suffix}"
        if await is_used(key, tags):
            return None
        items = await actor_genre_titles(db, person.id, genre.id, types, pool_size, persian)
        if len(items) < min_items:
            return None
        return Theme("actor", work, key, genre_fa, name, None, None, None, tags, items, persian)

    decade = rng.choice(DECADES)
    tags = [genre_fa, f"دهه {decade_label(decade)}", *extra_tag]
    key = f"d:{work}:{genre.id}:{decade}{suffix}"
    if await is_used(key, tags):
        return None
    items = await decade_genre_titles(db, genre.id, decade, types, pool_size, persian)
    if len(items) < min_items:
        return None
    return Theme("decade", work, key, genre_fa, None, decade, None, None, tags, items, persian)
