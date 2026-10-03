"""
Themed battle pool for the home page's battle arena: a handful of movies that
share one thing -- a genre, a decade or a director -- for a "winner stays"
run (the client plays the pool out, see frontend/components/home/BattleArena).

Guests get a random theme. A signed-in user gets one built from their own
taste: a seed movie out of their taste anchors (the movie opens the run as the
champion), else one of their top genres, else -- no taste data yet -- the
guest behaviour. Never persisted: a live read, same shape as
SuggestedBattleService.

There's no keyword/topic relation in the graph yet, so those are the only
three kinds.
"""
import random
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.entities.models import Entity, EntityRanking, RelationshipEdge
from app.modules.entities.repository import EntityRepository
from app.modules.taste.repository import TasteRepository

CATEGORY = "movie"  # default; a deep-linked pair may be another type
POOL_SIZE = 8       # movies per run, champion included
MIN_POOL = 4        # fewer than this isn't a run worth playing
MEMBER_WINDOW = 150  # top-scored movies of a theme the run is sampled from
SEED_WINDOW = 300    # top-scored movies a guest's seed is drawn from
MAX_SEEDS = 4
TOP_GENRES = 3

RELATION_FOR_KIND = {"genre": "has_genre", "director": "directed_by"}


class Theme:
    __slots__ = ("kind", "value", "target_id", "decade")

    def __init__(self, kind: str, value: str, target_id: uuid.UUID | None = None, decade: int | None = None):
        self.kind = kind
        self.value = value
        self.target_id = target_id
        self.decade = decade


class ThemedPool:
    __slots__ = ("theme", "items", "personalized")

    def __init__(self, theme: Theme, items: list[dict], personalized: bool):
        self.theme = theme
        self.items = items
        self.personalized = personalized


def _name(entity: Entity) -> str:
    return (entity.attributes or {}).get("title_fa") or entity.title


def _item(entity: Entity, score: float | None) -> dict:
    attrs = entity.attributes or {}
    return {
        "id": entity.id,
        "slug": entity.slug,
        "title": entity.title,
        "title_fa": attrs.get("title_fa"),
        "entity_type": entity.entity_type,
        "poster_path": attrs.get("poster_path"),
        "year": attrs.get("year"),
        "computed_score": score,
    }


class ThemedBattleService:
    def __init__(self, db: AsyncSession, category: str = CATEGORY):
        self.db = db
        self.category = category
        self.entity_repo = EntityRepository(db)
        self.taste_repo = TasteRepository(db)

    async def get_pool(
        self,
        user_id: uuid.UUID | None,
        left_id: uuid.UUID | None = None,
        right_id: uuid.UUID | None = None,
    ) -> ThemedPool | None:
        if left_id is not None and right_id is not None:
            pool = await self._pair_pool(left_id, right_id)
            if pool is not None:
                return pool
        if user_id is not None:
            pool = await self._personal_pool(user_id)
            if pool is not None:
                return pool
        return await self._guest_pool()

    async def _pair_pool(self, left_id: uuid.UUID, right_id: uuid.UUID) -> ThemedPool | None:
        """A deep-linked pair (SuggestedBattleCard's "شروع نبرد") opens the
        run; the rest comes from the first side's theme."""
        left = await self.entity_repo.get_by_id(left_id)
        right = await self.entity_repo.get_by_id(right_id)
        if left is None or right is None or left_id == right_id:
            return None
        if left.entity_type != self.category or right.entity_type != self.category:
            return None
        items = [_item(left, await self._score(left.id)), _item(right, await self._score(right.id))]
        for theme in await self._themes_for(left):
            members = [m for m in await self._members(theme, exclude_id=left.id) if m[0].id != right.id]
            if len(members) >= 2:
                items += self._sample(members, POOL_SIZE - 2)
                break
        return ThemedPool(Theme("pair", ""), items, personalized=False)

    # -- pools ---------------------------------------------------------------

    async def _guest_pool(self) -> ThemedPool | None:
        stmt = (
            select(Entity)
            .join(EntityRanking, EntityRanking.entity_id == Entity.id)
            .where(Entity.entity_type == self.category, Entity.attributes["poster_path"].astext.isnot(None))
            .order_by(EntityRanking.computed_score.desc().nulls_last())
            .limit(SEED_WINDOW)
        )
        seeds = list((await self.db.execute(stmt)).scalars().all())
        return await self._pool_from_seeds(seeds, personalized=False, seed_leads=False)

    async def _personal_pool(self, user_id: uuid.UUID) -> ThemedPool | None:
        anchors = await self.taste_repo.list_anchors_with_entities(user_id)
        seeds = [
            entity
            for _anchor, entity in anchors
            if entity.entity_type == self.category and (entity.attributes or {}).get("poster_path")
        ]
        pool = await self._pool_from_seeds(seeds, personalized=True, seed_leads=True)
        if pool is not None:
            return pool

        dimensions = (await self.taste_repo.list_dimensions(user_id, "genre"))[:TOP_GENRES]
        random.shuffle(dimensions)
        for dimension in dimensions:
            genre = await self.entity_repo.get_by_slug(dimension.dimension_key, entity_type="genre")
            if genre is None:
                continue
            theme = Theme("genre", genre.title, target_id=genre.id)
            members = await self._members(theme, exclude_id=None)
            if len(members) >= MIN_POOL:
                return ThemedPool(theme, self._sample(members, POOL_SIZE), personalized=True)
        return None

    async def _pool_from_seeds(
        self, seeds: list[Entity], personalized: bool, seed_leads: bool
    ) -> ThemedPool | None:
        for seed in random.sample(seeds, min(len(seeds), MAX_SEEDS)):
            for theme in await self._themes_for(seed):
                members = await self._members(theme, exclude_id=seed.id)
                if len(members) < MIN_POOL - 1:
                    continue
                picked = self._sample(members, POOL_SIZE - 1)
                head = [_item(seed, await self._score(seed.id))]
                items = head + picked if seed_leads else self._shuffled(head + picked)
                return ThemedPool(theme, items, personalized)
        return None

    # -- themes --------------------------------------------------------------

    async def _themes_for(self, seed: Entity) -> list[Theme]:
        """The seed's possible themes: one random pick per kind, kinds in random order."""
        edges = await self.entity_repo.get_relationships_by_type(seed.id, list(RELATION_FOR_KIND.values()))
        by_kind: dict[str, list[Theme]] = {
            kind: [Theme(kind, _name(e.to_entity), target_id=e.to_entity_id) for e in edges[relation]]
            for kind, relation in RELATION_FOR_KIND.items()
        }
        year = (seed.attributes or {}).get("year")
        if isinstance(year, int):
            decade = year // 10 * 10
            by_kind["decade"] = [Theme("decade", str(decade), decade=decade)]

        kinds = [k for k, themes in by_kind.items() if themes]
        random.shuffle(kinds)
        return [random.choice(by_kind[k]) for k in kinds]

    async def _members(self, theme: Theme, exclude_id: uuid.UUID | None) -> list[tuple[Entity, float | None]]:
        stmt = (
            select(Entity, EntityRanking.computed_score)
            .outerjoin(EntityRanking, EntityRanking.entity_id == Entity.id)
            .where(Entity.entity_type == self.category, Entity.attributes["poster_path"].astext.isnot(None))
        )
        if exclude_id is not None:
            stmt = stmt.where(Entity.id != exclude_id)
        if theme.kind == "decade":
            stmt = stmt.where(Entity.attributes["year"].as_integer().between(theme.decade, theme.decade + 9))
        else:
            stmt = stmt.join(RelationshipEdge, RelationshipEdge.from_entity_id == Entity.id).where(
                RelationshipEdge.relation_type == RELATION_FOR_KIND[theme.kind],
                RelationshipEdge.to_entity_id == theme.target_id,
            )
        stmt = stmt.order_by(EntityRanking.computed_score.desc().nulls_last()).limit(MEMBER_WINDOW)
        return [(entity, score) for entity, score in (await self.db.execute(stmt)).all()]

    async def _score(self, entity_id: uuid.UUID) -> float | None:
        result = await self.db.execute(
            select(EntityRanking.computed_score).where(EntityRanking.entity_id == entity_id)
        )
        return result.scalar_one_or_none()

    # -- helpers -------------------------------------------------------------

    @staticmethod
    def _sample(members: list[tuple[Entity, float | None]], count: int) -> list[dict]:
        return [_item(entity, score) for entity, score in random.sample(members, min(len(members), count))]

    @staticmethod
    def _shuffled(items: list[dict]) -> list[dict]:
        items = list(items)
        random.shuffle(items)
        return items
