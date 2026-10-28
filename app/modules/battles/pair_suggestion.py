"""
Home-page "create a battle" suggestion: two movies/series the user gave the
same rating, plus up to three rivals for the second one taken from the
similarity graph. Computed live, never persisted.
"""
import random
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.entities.models import Entity
from app.modules.entities.repository import EntityRepository
from app.modules.users.models import UserRating

BATTLE_TYPES = ("movie", "tv_series")
MIN_SCORE = 3  # a tie among films the user disliked isn't a fun battle
MAX_RIVALS = 3


def entity_brief(entity: Entity) -> dict:
    attrs = entity.attributes or {}
    return {
        "id": entity.id,
        "slug": entity.slug,
        "title": entity.title,
        "title_fa": attrs.get("title_fa"),
        "entity_type": entity.entity_type,
        "poster_path": attrs.get("poster_path"),
    }


def pick_tied_pair(rows: list[tuple[uuid.UUID, int]], rng: random.Random) -> tuple[uuid.UUID, uuid.UUID, int] | None:
    """Two entity ids sharing one score (highest tied score preferred), or None."""
    by_score: dict[int, list[uuid.UUID]] = {}
    for entity_id, score in rows:
        if score >= MIN_SCORE:
            by_score.setdefault(score, []).append(entity_id)
    for score in sorted(by_score, reverse=True):
        ids = by_score[score]
        if len(ids) >= 2:
            a, b = rng.sample(ids, 2)
            return a, b, score
    return None


class PairSuggestionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.entity_repo = EntityRepository(db)

    async def suggest(self, user_id: uuid.UUID, rng: random.Random | None = None) -> dict | None:
        rng = rng or random.Random()
        result = await self.db.execute(
            select(UserRating.entity_id, UserRating.score)
            .join(Entity, Entity.id == UserRating.entity_id)
            .where(UserRating.user_id == user_id, Entity.entity_type.in_(BATTLE_TYPES))
        )
        tied = pick_tied_pair([(r[0], r[1]) for r in result.all()], rng)
        if tied is None:
            return None
        a_id, b_id, score = tied
        a = await self.db.get(Entity, a_id)
        b = await self.db.get(Entity, b_id)
        if a is None or b is None or a.entity_type != b.entity_type:
            return None

        rated = {r for (r,) in (await self.db.execute(select(UserRating.entity_id).where(UserRating.user_id == user_id))).all()}
        rivals = []
        for edge in await self.entity_repo.get_relationships(b.id, "similar_to"):
            other = edge.to_entity
            if other is None or other.id in (a.id, b.id) or other.entity_type != b.entity_type:
                continue
            rivals.append((other.id in rated, other))
        rivals.sort(key=lambda t: t[0])  # unseen-by-rating first, stable otherwise
        return {
            "category": b.entity_type,
            "score": score,
            "left": entity_brief(a),
            "right": entity_brief(b),
            "rivals": [entity_brief(o) for _, o in rivals[:MAX_RIVALS]],
        }
