"""
Ego graph for the home hero: one centre entity (person, movie or series)
and the small neighbourhood that explains how it connects to the rest of
the catalog.

Person centre:  person -> their 3 best titles -> the people who also appear
                in >=2 of those titles -> the genres those titles share.
Title centre:   title -> its director(s)/lead cast -> those people's other
                best titles -> the genres shared by the titles.

Everything is derived from the relationships table; nothing is invented.
"""
import asyncio
import logging
import time
from collections import Counter, defaultdict

from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.database import ReadSessionLocal
from app.core.exceptions import NotFoundError
from app.modules.entities.models import Entity, RelationshipEdge
from app.modules.entities.repository import EntityRepository, _apply_origin
from app.modules.entities.service import _extract_media

logger = logging.getLogger(__name__)

CREDITS = ("directed_by", "creator", "acted_in")
WORK_TYPES = ("movie", "tv_series")
MAX_WORKS = 3
MAX_PEOPLE = 4
MAX_GENRES = 2


def _node(entity: Entity, role: str, credits: set | None = None) -> dict:
    attrs = entity.attributes or {}
    # Only entities loaded with their ranking carry a score (people don't).
    ranking = None if "ranking" in inspect(entity).unloaded else entity.ranking
    return {
        "id": str(entity.id),
        "slug": entity.slug,
        "title": entity.title,
        "title_fa": attrs.get("title_fa"),
        "entity_type": entity.entity_type,
        "year": attrs.get("year"),
        "score": ranking.computed_score if ranking else None,
        "image_url": _extract_media(attrs).image_url,
        "role": role,
        # How a person took part in the titles on the board (directed_by /
        # creator / acted_in); the UI turns these into "کارگردان" etc.
        "credits": sorted(credits or (), key=CREDITS.index),
    }


def _score(entity: Entity) -> float:
    return (entity.ranking.computed_score if entity.ranking else None) or 0.0


async def _credits_of(db: AsyncSession, person_ids: list, exclude: set) -> list[tuple]:
    """(work, person_id, relation_type) for every credit of the given people on a movie/series."""
    stmt = (
        select(Entity, RelationshipEdge.to_entity_id, RelationshipEdge.relation_type)
        .join(RelationshipEdge, RelationshipEdge.from_entity_id == Entity.id)
        .options(joinedload(Entity.ranking))
        .where(
            RelationshipEdge.to_entity_id.in_(person_ids),
            RelationshipEdge.relation_type.in_(CREDITS),
            Entity.entity_type.in_(WORK_TYPES),
        )
    )
    return [(w, p, r) for w, p, r in (await db.execute(stmt)).unique().all() if w.id not in exclude]


async def _people_of(db: AsyncSession, work_ids: list) -> list[tuple]:
    """(work_id, person, relation_type) for the credits of the given titles."""
    stmt = (
        select(RelationshipEdge.from_entity_id, Entity, RelationshipEdge.relation_type)
        .join(Entity, Entity.id == RelationshipEdge.to_entity_id)
        .where(
            RelationshipEdge.from_entity_id.in_(work_ids),
            RelationshipEdge.relation_type.in_(CREDITS),
            Entity.entity_type == "person",
        )
    )
    return list((await db.execute(stmt)).all())


async def build_ego_graph(db: AsyncSession, slug: str) -> dict:
    center = (
        await db.execute(
            select(Entity)
            .options(joinedload(Entity.ranking))
            .where(Entity.slug == slug, Entity.entity_type.in_(("person", *WORK_TYPES)))
        )
    ).scalar_one_or_none()
    if center is None:
        raise NotFoundError(f"Entity '{slug}' not found")

    nodes: dict[str, dict] = {}
    edges: list[dict] = []

    def link(a, b, kind):
        edges.append({"source": str(a), "target": str(b), "kind": kind})

    works: list[Entity] = []
    people: list[Entity] = []
    credit_pairs: set[tuple] = set()  # (work_id, person_id)
    roles: dict = defaultdict(set)  # person_id -> relation types on the board

    if center.entity_type == "person":
        best: dict = {}
        for work, _, _rel in await _credits_of(db, [center.id], set()):
            best[work.id] = work
        works = sorted(best.values(), key=_score, reverse=True)[:MAX_WORKS]
        for w in works:
            credit_pairs.add((w.id, center.id))
        if works:
            rows = await _people_of(db, [w.id for w in works])
            titles_of: dict = defaultdict(set)  # one credit per title, even if both actor and writer
            by_id: dict = {}
            for wid, person, rel in rows:
                roles[person.id].add(rel)
                if person.id == center.id:
                    continue
                titles_of[person.id].add(wid)
                by_id[person.id] = person
            counts = {pid: len(wids) for pid, wids in titles_of.items()}
            # People shared by several of these titles first; when fewer than
            # two are, fall back to the most frequent credits so the titles
            # still show who made them.
            ranked = sorted(counts, key=lambda pid: (-counts[pid], str(pid)))
            shared = [pid for pid in ranked if counts[pid] >= 2][:MAX_PEOPLE]
            chosen = shared if len(shared) >= 2 else ranked[:MAX_PEOPLE]
            people = [by_id[pid] for pid in chosen]
            wanted = {(w.id, p.id) for w in works for p in people}
            credit_pairs |= {(wid, person.id) for wid, person, _ in rows} & wanted
    else:
        rows = await _people_of(db, [center.id])
        # Directors/creators before cast.
        rows.sort(key=lambda r: 0 if r[2] in ("directed_by", "creator") else 1)
        seen: set = set()
        for _wid, person, rel in rows:
            roles[person.id].add(rel)
            if person.id not in seen and len(people) < MAX_PEOPLE:
                seen.add(person.id)
                people.append(person)
        for p in people:
            credit_pairs.add((center.id, p.id))
        if people:
            per_work: dict = defaultdict(set)
            entities: dict = {}
            for work, pid, _rel in await _credits_of(db, [p.id for p in people], {center.id}):
                per_work[work.id].add(pid)
                entities[work.id] = work
            order = sorted(entities, key=lambda wid: (-len(per_work[wid]), -_score(entities[wid]), str(wid)))
            works = [entities[wid] for wid in order[:MAX_WORKS]]
            for w in works:
                for pid in per_work[w.id]:
                    credit_pairs.add((w.id, pid))

    nodes[str(center.id)] = _node(center, "center", roles.get(center.id))
    for w in works:
        nodes.setdefault(str(w.id), _node(w, "work"))
    for p in people:
        nodes.setdefault(str(p.id), _node(p, "person", roles[p.id]))

    for work_id, person_id in credit_pairs:
        if str(work_id) in nodes and str(person_id) in nodes:
            link(work_id, person_id, "credit")

    # Genres of the titles on the board (the centre counts when it is one).
    titled = list(works) + ([center] if center.entity_type in WORK_TYPES else [])
    if titled:
        g_rows = (
            await db.execute(
                select(RelationshipEdge.from_entity_id, Entity)
                .join(Entity, Entity.id == RelationshipEdge.to_entity_id)
                .where(
                    RelationshipEdge.from_entity_id.in_([t.id for t in titled]),
                    RelationshipEdge.relation_type == "has_genre",
                )
            )
        ).all()
        g_count = Counter(g.id for _, g in g_rows)
        g_by_id = {g.id: g for _, g in g_rows}
        top = sorted(g_count, key=lambda gid: (-g_count[gid], g_by_id[gid].title))[:MAX_GENRES]
        top_set = set(top)
        for gid in top:
            g = g_by_id[gid]
            nodes.setdefault(str(g.id), {
                "id": str(g.id), "slug": g.slug, "title": g.title, "title_fa": None,
                "entity_type": "genre", "year": None, "score": None, "image_url": None, "role": "genre",
            })
        for work_id, g in g_rows:
            if g.id in top_set:
                link(work_id, g.id, "genre")

    return {"center_id": str(center.id), "nodes": list(nodes.values()), "edges": edges}


# ---------------------------------------------------------------------------
# Hero pool: the entities the home hero rotates through, indexed once.
# ---------------------------------------------------------------------------

HERO_TTL_SECONDS = 1800
# (entity_type, persian?, how many, min IMDb votes). Iranian titles have far
# fewer IMDb votes than foreign ones, hence the separate floors.
HERO_TITLE_SLOTS = (
    ("movie", True, 4, 1000),
    ("tv_series", True, 3, 500),
    ("movie", False, 3, 50000),
    ("tv_series", False, 2, 50000),
)
HERO_PEOPLE_SLOTS = ((True, 4), (False, 2))
HERO_MIN_IMDB = 7.5
HERO_MIN_NODES = 5

_hero_cache: tuple[float, list[dict]] | None = None
_hero_task: asyncio.Task | None = None
_HERO_CONCURRENCY = 3  # sessions in flight; the DB pool is shared with everything else


async def _top_titles(entity_type: str, persian: bool, limit: int, min_votes: int) -> list[str]:
    rating = Entity.attributes["imdb_rating"].as_float()
    votes = Entity.attributes["imdb_votes"].as_integer()
    stmt = select(Entity.slug).where(
        Entity.entity_type == entity_type,
        rating >= HERO_MIN_IMDB,
        votes >= min_votes,
    )
    stmt = _apply_origin(stmt, Entity, "persian" if persian else "foreign")
    async with ReadSessionLocal() as db:
        return list((await db.execute(stmt.order_by(rating.desc(), Entity.id).limit(limit))).scalars())


async def _top_people(persian: bool, limit: int) -> list[str]:
    async with ReadSessionLocal() as db:
        rows, _ = await EntityRepository(db).list_people(1, limit, "all", "works", "persian" if persian else "foreign")
    return [person.slug for person, _w, _a in rows]


async def _compute_hero_pool() -> list[dict]:
    picked = await asyncio.gather(
        *(_top_titles(t, p, n, v) for t, p, n, v in HERO_TITLE_SLOTS),
        *(_top_people(p, n) for p, n in HERO_PEOPLE_SLOTS),
    )
    slugs = [slug for group in picked for slug in group]
    gate = asyncio.Semaphore(_HERO_CONCURRENCY)

    async def one(slug: str) -> dict | None:
        async with gate, ReadSessionLocal() as db:
            try:
                return await build_ego_graph(db, slug)
            except Exception:
                logger.exception("hero pool: ego graph failed for %s", slug)
                return None

    graphs = await asyncio.gather(*(one(s) for s in slugs))
    # A centre with little around it makes a lonely sky.
    return [g for g in graphs if g and len(g["nodes"]) >= HERO_MIN_NODES]


async def _refresh_hero_pool() -> None:
    global _hero_cache
    try:
        graphs = await _compute_hero_pool()
        if graphs:  # never replace a good cache with an empty result
            _hero_cache = (time.monotonic(), graphs)
    except Exception:
        logger.exception("hero pool refresh failed")


def get_hero_pool() -> list[dict]:
    """
    The home hero's pre-built ego graphs: a mixed Iranian/foreign set of
    high-IMDb titles and best-connected people, indexed once and kept in
    memory. Never blocks -- a stale cache is served while a refresh runs in
    the background, and an empty list is returned until the first build
    finishes (warm_hero_pool() starts it at boot).
    """
    global _hero_task
    fresh = _hero_cache is not None and time.monotonic() - _hero_cache[0] < HERO_TTL_SECONDS
    if not fresh and (_hero_task is None or _hero_task.done()):
        _hero_task = asyncio.create_task(_refresh_hero_pool())
    return _hero_cache[1] if _hero_cache else []


def warm_hero_pool() -> None:
    get_hero_pool()
