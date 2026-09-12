"""
Suggested battle: pairs a user's own taste anchor (something they already
love) against the entity they're currently looking at, for a "discovery +
comparison" card on that entity's detail page.

Only meaningful for a logged-in user with at least one anchor -- there's
no non-personalized fallback (see get_suggested_battle's docstring for
why). Never persisted; computed fresh on every call, same "live read, no
table" shape as PredictedPicksService in the taste module.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.entities.models import EntityRanking
from app.modules.entities.repository import EntityRepository
from app.modules.taste.repository import TasteRepository


class SuggestedBattlePair:
    __slots__ = ("left", "right")

    def __init__(self, left, right):
        self.left = left
        self.right = right


class SuggestedBattleService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.entity_repo = EntityRepository(db)
        self.taste_repo = TasteRepository(db)

    async def get_suggested_battle_for_slug(
        self, user_id: uuid.UUID | None, slug: str, entity_type: str
    ) -> SuggestedBattlePair | None:
        if user_id is None:
            # No non-personalized fallback: the whole point of this card is
            # "vs. something YOU already love" -- a generic "popular in this
            # genre" pairing for guests would need its own ranking query and
            # its own copy so it doesn't overpromise personalization it
            # doesn't have. Simpler and safer to just not show the card.
            return None

        current_entity = await self.entity_repo.get_by_slug(slug, entity_type=entity_type)
        if current_entity is None:
            return None

        return await self._get_suggested_battle(user_id, current_entity)

    async def _get_suggested_battle(self, user_id: uuid.UUID, current_entity) -> SuggestedBattlePair | None:
        anchor_rows = await self.taste_repo.list_anchors_with_entities(user_id)

        # Battles are same-type-only (BattleService._validate_matchup), so
        # the anchor must match current_entity's type -- and obviously can't
        # BE current_entity, or the "battle" is one entity against itself.
        same_type_anchors = [
            (anchor, entity)
            for anchor, entity in anchor_rows
            if entity.entity_type == current_entity.entity_type and entity.id != current_entity.id
        ]
        if not same_type_anchors:
            return None

        current_genre_ids = {edge.to_entity_id for edge in await self.entity_repo.get_relationships(
            current_entity.id, "has_genre"
        )}

        # same_type_anchors is already ordered by anchor.rank ascending
        # (strongest first, from list_anchors_with_entities) -- prefer the
        # strongest one that ALSO shares a genre with the entity the user
        # is currently looking at, for a more relevant pairing; fall back
        # to the strongest same-type anchor if none share a genre.
        chosen_anchor_entity = same_type_anchors[0][1]
        for _anchor, entity in same_type_anchors:
            genre_ids = {edge.to_entity_id for edge in await self.entity_repo.get_relationships(
                entity.id, "has_genre"
            )}
            if current_genre_ids & genre_ids:
                chosen_anchor_entity = entity
                break

        anchor_score = await self._computed_score(chosen_anchor_entity.id)
        current_score = await self._computed_score(current_entity.id)

        return SuggestedBattlePair(
            left={
                "id": chosen_anchor_entity.id,
                "slug": chosen_anchor_entity.slug,
                "title": chosen_anchor_entity.title,
                "entity_type": chosen_anchor_entity.entity_type,
                "poster_path": chosen_anchor_entity.attributes.get("poster_path"),
                "computed_score": anchor_score,
            },
            right={
                "id": current_entity.id,
                "slug": current_entity.slug,
                "title": current_entity.title,
                "entity_type": current_entity.entity_type,
                "poster_path": current_entity.attributes.get("poster_path"),
                "computed_score": current_score,
            },
        )

    async def _computed_score(self, entity_id: uuid.UUID) -> float | None:
        result = await self.db.execute(
            select(EntityRanking.computed_score).where(EntityRanking.entity_id == entity_id)
        )
        return result.scalar_one_or_none()
