import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

# Adjust to your actual Entity model location/fields.
from app.modules.entities.models import Entity

from .models import EntityEloScore, PairVote, VoteOutcome

DEFAULT_ELO = 1200.0


class BattleRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ---------- Elo score bootstrap / read ----------

    async def get_or_create_elo(self, entity_id: uuid.UUID, category: str) -> EntityEloScore:
        result = await self.db.execute(
            select(EntityEloScore).where(
                EntityEloScore.entity_id == entity_id,
                EntityEloScore.category == category,
            )
        )
        row = result.scalar_one_or_none()
        if row is None:
            row = EntityEloScore(entity_id=entity_id, category=category, elo_score=DEFAULT_ELO)
            self.db.add(row)
            await self.db.flush()
        return row

    async def get_elo_map(self, entity_ids: list[uuid.UUID], category: str) -> dict[uuid.UUID, EntityEloScore]:
        result = await self.db.execute(
            select(EntityEloScore).where(
                EntityEloScore.entity_id.in_(entity_ids),
                EntityEloScore.category == category,
            )
        )
        return {row.entity_id: row for row in result.scalars().all()}

    # ---------- Matchmaking ----------

    async def get_random_entity(self, category: str) -> Entity | None:
        result = await self.db.execute(
            select(Entity)
            .where(Entity.entity_type == category)
            .order_by(func.random())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_closest_opponent(
        self,
        category: str,
        anchor_entity_id: uuid.UUID,
        anchor_elo: float,
        exclude_ids: list[uuid.UUID],
        user_id: uuid.UUID,
        recent_days: int = 3,
    ) -> Entity | None:
        """
        Pick an opponent whose Elo score is closest to the anchor's,
        excluding entities this user has already been shown against the
        anchor within `recent_days`. Falls back to the closest-by-Elo
        entity overall if everything has been recently seen.
        """
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

        # Join entities with their elo score (default to DEFAULT_ELO via
        # LEFT JOIN + coalesce for entities that haven't been rated yet).
        elo_expr = func.coalesce(EntityEloScore.elo_score, DEFAULT_ELO)
        query = (
            select(Entity, elo_expr.label("elo"))
            .outerjoin(
                EntityEloScore,
                (EntityEloScore.entity_id == Entity.id)
                & (EntityEloScore.category == category),
            )
            .where(Entity.entity_type == category, Entity.id.notin_(all_excluded))
            .order_by(func.abs(elo_expr - anchor_elo))
            .limit(1)
        )
        result = await self.db.execute(query)
        row = result.first()
        return row[0] if row else None

    # ---------- Voting ----------

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
