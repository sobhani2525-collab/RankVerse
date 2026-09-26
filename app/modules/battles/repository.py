import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.entities.models import Entity
from app.modules.entities.repository import EntityRepository

from .models import EntityEloScore, PairVote, VoteOutcome

DEFAULT_ELO = 1200.0


class BattleRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_elo_map(self, entity_ids: list[uuid.UUID], category: str) -> dict[uuid.UUID, EntityEloScore]:
        result = await self.db.execute(
            select(EntityEloScore).where(
                EntityEloScore.entity_id.in_(entity_ids),
                EntityEloScore.category == category,
            )
        )
        return {row.entity_id: row for row in result.scalars().all()}

    def default_elo(self, entity_id: uuid.UUID, category: str) -> EntityEloScore:
        """A never-battled entity's Elo row, not added to the session: reads
        (showing a pair) don't need it written, and the first vote on the
        entity adds it (BattleService.get_elo_rows)."""
        return EntityEloScore(entity_id=entity_id, category=category, elo_score=DEFAULT_ELO, matches_played=0)

    async def get_entities(self, entity_ids: list[uuid.UUID]) -> dict[uuid.UUID, Entity]:
        result = await self.db.execute(select(Entity).where(Entity.id.in_(entity_ids)))
        return {entity.id: entity for entity in result.scalars().all()}

    async def get_random_entity(self, category: str) -> tuple[Entity, EntityEloScore | None] | None:
        """A random entity of the category plus its Elo row (None if it has
        never been in a battle), in one round trip."""
        result = await self.db.execute(
            select(Entity, EntityEloScore)
            .outerjoin(
                EntityEloScore,
                (EntityEloScore.entity_id == Entity.id) & (EntityEloScore.category == category),
            )
            .where(Entity.entity_type == category)
            .order_by(func.random())
            .limit(1)
        )
        row = result.first()
        return (row[0], row[1]) if row else None

    async def get_closest_opponent(
        self,
        category: str,
        anchor_entity_id: uuid.UUID,
        anchor_elo: float,
        exclude_ids: list[uuid.UUID],
        user_id: uuid.UUID,
        recent_days: int = 3,
    ) -> tuple[Entity, EntityEloScore | None] | None:
        """The closest-Elo opponent for the anchor, plus the opponent's Elo
        row (None if it has never been in a battle)."""
        recent_cutoff = datetime.now(timezone.utc) - timedelta(days=recent_days)

        recent_pairs_subq = (
            select(PairVote.left_item, PairVote.right_item)
            .where(
                PairVote.user_id == user_id,
                PairVote.created_at >= recent_cutoff,
                (
                    (PairVote.left_item == anchor_entity_id)
                    | (PairVote.right_item == anchor_entity_id)
                ),
            )
        )
        recent_result = await self.db.execute(recent_pairs_subq)
        recently_paired_ids = {
            other for pair in recent_result.all() for other in pair if other != anchor_entity_id
        }
        all_excluded = set(exclude_ids) | recently_paired_ids | {anchor_entity_id}

        elo_expr = func.coalesce(EntityEloScore.elo_score, DEFAULT_ELO)

        entity_repo = EntityRepository(self.db)
        related_ids = await entity_repo.get_related_ids(anchor_entity_id, limit=30)
        candidate_ids = [i for i in related_ids if i not in all_excluded]

        if candidate_ids:
            query = (
                select(Entity, EntityEloScore)
                .outerjoin(
                    EntityEloScore,
                    (EntityEloScore.entity_id == Entity.id)
                    & (EntityEloScore.category == category),
                )
                .where(Entity.entity_type == category, Entity.id.in_(candidate_ids))
                .order_by(func.abs(elo_expr - anchor_elo), func.random())
                .limit(1)
            )
            result = await self.db.execute(query)
            row = result.first()
            if row:
                return row[0], row[1]

        query = (
            select(Entity, EntityEloScore)
            .outerjoin(
                EntityEloScore,
                (EntityEloScore.entity_id == Entity.id)
                & (EntityEloScore.category == category),
            )
            .where(Entity.entity_type == category, Entity.id.notin_(all_excluded))
            .order_by(func.abs(elo_expr - anchor_elo), func.random())
            .limit(1)
        )
        result = await self.db.execute(query)
        row = result.first()
        return (row[0], row[1]) if row else None

    async def create_vote(
        self,
        user_id: uuid.UUID,
        category: str,
        left_item: uuid.UUID,
        right_item: uuid.UUID,
        winner: VoteOutcome,
        left_score_before: float,
        right_score_before: float,
    ) -> PairVote:
        vote = PairVote(
            user_id=user_id,
            category=category,
            left_item=left_item,
            right_item=right_item,
            winner=winner,
            left_score_before=left_score_before,
            right_score_before=right_score_before,
        )
        self.db.add(vote)
        await self.db.flush()
        return vote

    async def count_votes_since(self, user_id: uuid.UUID, since: datetime) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(PairVote).where(
                PairVote.user_id == user_id, PairVote.created_at >= since
            )
        )
        return result.scalar_one()

    async def commit(self):
        await self.db.commit()