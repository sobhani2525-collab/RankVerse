from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.config import settings
from app.modules.entities.models import Entity, EntityRanking, RelationshipEdge
from app.modules.ranking.schemas import RankingGroupRef, RankingHighlight
from app.modules.users.models import UserRating

# relation_type (outgoing edge from the entity) -> human-facing dimension label
RANKING_DIMENSIONS: dict[str, str] = {
    "has_genre": "genre",
    "directed_by": "director",
    # tv_series' equivalent of a movie's director -- TMDb TV credits rarely
    # carry a series-level "Director" (see sync/normalizer.py), so without
    # this a show would never get a "#N best <showrunner>" highlight at all.
    "creator": "creator",
}


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

    async def get_entity_highlights(
        self, entity: Entity, min_group_size: int | None = None
    ) -> list[RankingHighlight]:
        """
        Where an entity ranks within each automatic ranking group it belongs to
        (one group per outgoing edge type in RANKING_DIMENSIONS, e.g. its genres
        or its director's filmography), skipping groups smaller than the threshold.
        """
        min_group_size = min_group_size if min_group_size is not None else settings.ranking_group_min_size
        member_entity = aliased(Entity)
        group_entity = aliased(Entity)

        highlights: list[RankingHighlight] = []
        for relation_type, dimension in RANKING_DIMENSIONS.items():
            ranked = (
                select(
                    RelationshipEdge.from_entity_id.label("member_id"),
                    RelationshipEdge.to_entity_id.label("group_id"),
                    func.rank()
                    .over(
                        partition_by=RelationshipEdge.to_entity_id,
                        order_by=EntityRanking.computed_score.desc().nulls_last(),
                    )
                    .label("rank"),
                    func.count()
                    .over(partition_by=RelationshipEdge.to_entity_id)
                    .label("group_size"),
                )
                .join(member_entity, member_entity.id == RelationshipEdge.from_entity_id)
                .outerjoin(EntityRanking, EntityRanking.entity_id == RelationshipEdge.from_entity_id)
                .where(
                    RelationshipEdge.relation_type == relation_type,
                    member_entity.entity_type == entity.entity_type,
                )
                .subquery()
            )

            stmt = (
                select(ranked.c.rank, ranked.c.group_size, group_entity.id, group_entity.slug, group_entity.title)
                .join(group_entity, group_entity.id == ranked.c.group_id)
                .where(ranked.c.member_id == entity.id, ranked.c.group_size >= min_group_size)
            )
            result = await self.db.execute(stmt)
            for rank, group_size, group_id, group_slug, group_title in result.all():
                highlights.append(
                    RankingHighlight(
                        dimension=dimension,
                        group=RankingGroupRef(id=group_id, slug=group_slug, title=group_title),
                        rank=rank,
                        group_size=group_size,
                    )
                )

        highlights.sort(key=lambda h: h.rank)
        return highlights

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
