from sqlalchemy import func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.config import settings
from app.modules.battles.models import EntityEloScore
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


# Elo's starting rating (see battles/models.py EntityEloScore) and the
# distance from it that counts as the strongest possible battle record.
ELO_BASELINE = 1200.0
ELO_SPREAD = 400.0


class RankingService:
    """
    Computes the RankVerse score for each entity using a Bayesian-average
    blend of user ratings, regularized by the platform average, plus a
    weighted contribution from the external (TMDb) score, nudged by how the
    entity has done in pairwise battles.

        bayesian_score = (v / (v + m)) * R + (m / (v + m)) * C
        blended        = alpha * bayesian_score + beta * external_score
        battle_adj     = w * (n / (n + k)) * clamp((elo - 1200) / 400, -1, 1)
        final_score    = blended + battle_adj

    Where:
        R = average user rating for the entity (1-5)
        v = number of user votes for the entity
        m = minimum votes threshold for full confidence (config)
        C = platform-wide average user rating
        alpha, beta = configurable weights (alpha + beta should be 1.0)
        elo, n = the entity's Elo rating and battles played in its category
        w = ranking_battle_weight (max points battles can add or remove)
        k = ranking_battle_min_matches (battles before half of w applies)

    battle_adj is additive and 0 for an entity with no battles, so enabling
    it leaves every never-battled entity's score exactly where it was.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.m = settings.ranking_min_votes
        self.alpha = settings.ranking_user_weight
        self.beta = settings.ranking_external_weight
        self.battle_weight = settings.ranking_battle_weight
        self.battle_k = settings.ranking_battle_min_matches

    async def get_platform_average(self) -> float:
        stmt = select(func.avg(UserRating.score))
        result = await self.db.execute(stmt)
        avg = result.scalar_one_or_none()
        return float(avg) if avg is not None else 3.0  # neutral midpoint of the 1-5 scale

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

    def battle_adjustment(self, elo: float | None, matches: int) -> float:
        """Points added to (or taken from) the blended score for battle
        results: Elo's distance from the 1200 start, capped at +/-400,
        scaled by a v/(v+k) confidence on battles played."""
        if elo is None or matches <= 0:
            return 0.0
        strength = max(-1.0, min(1.0, (elo - ELO_BASELINE) / ELO_SPREAD))
        confidence = matches / (matches + self.battle_k)
        return self.battle_weight * confidence * strength

    async def get_battle_stats(self, entity: Entity) -> tuple[float | None, int]:
        # Battle category == entity_type (battles are same-type only).
        stmt = select(EntityEloScore.elo_score, EntityEloScore.matches_played).where(
            EntityEloScore.entity_id == entity.id,
            EntityEloScore.category == entity.entity_type,
        )
        row = (await self.db.execute(stmt)).one_or_none()
        return (row[0], row[1]) if row else (None, 0)

    async def recompute_entity(self, entity: Entity) -> EntityRanking:
        """Recompute and persist the score for a single entity."""
        C = await self.get_platform_average()
        R, v = await self.get_entity_stats(entity.id)
        bayesian = self.bayesian_score(v, R, C)

        # TMDb rating is 0-10 already; stored in attributes at ingest time
        external_score = entity.attributes.get("external_rating")
        elo, matches = await self.get_battle_stats(entity)
        final = round(
            self.blend_with_external(bayesian, external_score, C) + self.battle_adjustment(elo, matches),
            2,
        )

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
        own_edge = aliased(RelationshipEdge)
        relation_types = list(RANKING_DIMENSIONS)

        # All dimensions in one query, and ranks computed only inside the
        # groups this entity belongs to (its own genres, director, ...)
        # rather than across every group of the type -- the per-dimension
        # version cost 3 round trips plus ~350ms of window over all genres.
        own_groups = select(own_edge.relation_type, own_edge.to_entity_id).where(
            own_edge.from_entity_id == entity.id,
            own_edge.relation_type.in_(relation_types),
        )
        ranked = (
            select(
                RelationshipEdge.relation_type.label("relation_type"),
                RelationshipEdge.from_entity_id.label("member_id"),
                RelationshipEdge.to_entity_id.label("group_id"),
                func.rank()
                .over(
                    partition_by=(RelationshipEdge.relation_type, RelationshipEdge.to_entity_id),
                    order_by=EntityRanking.computed_score.desc().nulls_last(),
                )
                .label("rank"),
                func.count()
                .over(partition_by=(RelationshipEdge.relation_type, RelationshipEdge.to_entity_id))
                .label("group_size"),
            )
            .join(member_entity, member_entity.id == RelationshipEdge.from_entity_id)
            .outerjoin(EntityRanking, EntityRanking.entity_id == RelationshipEdge.from_entity_id)
            .where(
                tuple_(RelationshipEdge.relation_type, RelationshipEdge.to_entity_id).in_(own_groups),
                member_entity.entity_type == entity.entity_type,
            )
            .subquery()
        )

        stmt = (
            select(
                ranked.c.relation_type,
                ranked.c.rank,
                ranked.c.group_size,
                group_entity.id,
                group_entity.slug,
                group_entity.title,
            )
            .join(group_entity, group_entity.id == ranked.c.group_id)
            .where(ranked.c.member_id == entity.id, ranked.c.group_size >= min_group_size)
        )
        result = await self.db.execute(stmt)
        highlights: list[RankingHighlight] = [
            RankingHighlight(
                dimension=RANKING_DIMENSIONS[relation_type],
                group=RankingGroupRef(id=group_id, slug=group_slug, title=group_title),
                rank=rank,
                group_size=group_size,
            )
            for relation_type, rank, group_size, group_id, group_slug, group_title in result.all()
        ]

        # Ties keep RANKING_DIMENSIONS order (genre, director, creator), as
        # when each dimension was queried and appended in turn.
        dimension_order = list(RANKING_DIMENSIONS.values())
        highlights.sort(key=lambda h: (h.rank, dimension_order.index(h.dimension)))
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
