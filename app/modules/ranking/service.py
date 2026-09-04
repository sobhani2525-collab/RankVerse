from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.entities.models import Entity, EntityRanking
from app.modules.users.models import UserRating


class RankingService:
    """
    Computes the RankVerse score for each entity using a Bayesian-average
    blend of user ratings, regularized by the platform average, plus a
    weighted contribution from the external (TMDb) score.

        bayesian_score = (v / (v + m)) * R + (m / (v + m)) * C
        final_score    = alpha * bayesian_score + beta * external_score

    Where:
        R = average user rating for the entity (0-10)
        v = number of user votes for the entity
        m = minimum votes threshold for full confidence (config)
        C = platform-wide average user rating
        alpha, beta = configurable weights (alpha + beta should be 1.0)
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.m = settings.ranking_min_votes
        self.alpha = settings.ranking_user_weight
        self.beta = settings.ranking_external_weight

    async def get_platform_average(self) -> float:
        stmt = select(func.avg(UserRating.score))
        result = await self.db.execute(stmt)
        avg = result.scalar_one_or_none()
        return float(avg) if avg is not None else 5.0  # neutral midpoint default

    async def get_entity_stats(self, entity_id) -> tuple[float | None, int]:
        stmt = select(func.avg(UserRating.score), func.count(UserRating.id)).where(
            UserRating.entity_id == entity_id
        )
        result = await self.db.execute(stmt)
        avg, count = result.one()
        return (float(avg) if avg is not None else None, count or 0)

    def bayesian_score(self, v: int, R: float | None, C: float) -> float:
        if v == 0 or R is None:
            return C
        return (v / (v + self.m)) * R + (self.m / (v + self.m)) * C

    def blend_with_external(self, bayesian: float, external_0_10: float | None, C: float) -> float:
        external = external_0_10 if external_0_10 is not None else C
        return round(self.alpha * bayesian + self.beta * external, 2)

    async def recompute_entity(self, entity: Entity) -> EntityRanking:
        """Recompute and persist the score for a single entity."""
        C = await self.get_platform_average()
        R, v = await self.get_entity_stats(entity.id)
        bayesian = self.bayesian_score(v, R, C)

        # TMDb rating is 0-10 already; stored in attributes at ingest time
        external_score = entity.attributes.get("external_rating")
        final = self.blend_with_external(bayesian, external_score, C)

        stmt = select(EntityRanking).where(EntityRanking.entity_id == entity.id)
        result = await self.db.execute(stmt)
        ranking = result.scalar_one_or_none()

        if ranking is None:
            ranking = EntityRanking(entity_id=entity.id)
            self.db.add(ranking)

        ranking.avg_user_score = R
        ranking.total_votes = v
        ranking.external_score = external_score
        ranking.computed_score = final
        await self.db.flush()
        return ranking

    async def recompute_all(self, entity_type: str = "movie") -> int:
        """Batch job: recompute rankings for every entity of a type. Meant to run on a schedule (e.g. hourly cron/Celery beat), not per-request."""
        stmt = select(Entity).where(Entity.entity_type == entity_type)
        result = await self.db.execute(stmt)
        entities = result.scalars().all()

        count = 0
        for entity in entities:
            await self.recompute_entity(entity)
            count += 1

        await self.db.commit()
        return count
