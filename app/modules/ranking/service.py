from bisect import bisect_left
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.config import settings
from app.core import database as _database, parallel
from app.core.cache import cached
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


class GroupScores:
    """One ranking group's member scores, ready for rank lookups."""

    def __init__(self, negated_scores: list[float], size: int):
        self.negated = negated_scores  # scores of scored members, negated, ascending
        self.size = size

    @classmethod
    def from_scores(cls, scores: list[float | None]) -> "GroupScores":
        return cls(sorted(-s for s in scores if s is not None), len(scores))

    def rank_of(self, score: float | None) -> int:
        """RANK() OVER (ORDER BY score DESC NULLS LAST) for a member scoring `score`."""
        if score is None:
            return len(self.negated) + 1
        return bisect_left(self.negated, -score) + 1


# Elo's starting rating (see battles/models.py EntityEloScore) and the
# distance from it that counts as the strongest possible battle record.
ELO_BASELINE = 1200.0
ELO_SPREAD = 400.0


@dataclass
class ScoreBreakdown:
    """Every input and intermediate step behind one entity's computed_score
    (what recompute_entities stores, and what the admin "why this score?" view shows)."""

    platform_avg: float  # C, 1-5
    user_avg: float | None  # R, 1-5
    user_votes: int  # v
    bayesian: float  # 1-5
    external_source: str  # imdb | tmdb | prior
    external_rating: float | None  # the raw 0-10 rating used
    external_votes: int
    external: float  # shrunk 0-10
    user_weight: float  # alpha after the v/(v+m) ramp
    blended: float  # 0-10
    elo: float | None
    matches: int
    battle_adjustment: float
    final: float


class RankingService:
    """
    Computes the CinemaGozin score for each entity using a Bayesian-average
    blend of user ratings, regularized by the platform average, plus a
    weighted contribution from the external (TMDb) score, nudged by how the
    entity has done in pairwise battles.

        bayesian_score = (v / (v + m)) * R + (m / (v + m)) * C
        blended        = alpha * (bayesian_score * 2) + beta * external_score
        battle_adj     = w * (n / (n + k)) * clamp((elo - 1200) / 400, -1, 1)
        final_score    = blended + battle_adj

    Where:
        R = average user rating for the entity (1-5, rescaled to 0-10 --
            same range as external_score -- before blending)
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
        self.ext_prior = settings.ranking_external_prior
        self.imdb_m = settings.ranking_imdb_min_votes
        self.tmdb_m = settings.ranking_tmdb_min_votes
        self.beta = settings.ranking_external_weight
        self.battle_weight = settings.ranking_battle_weight
        self.battle_k = settings.ranking_battle_min_matches

    def bayesian_score(self, v: int, R: float | None, C: float) -> float:
        if v == 0 or R is None:
            return C
        return (v / (v + self.m)) * R + (self.m / (v + self.m)) * C

    def external_inputs(self, attrs: dict) -> tuple[str, float | None, int, int]:
        """(source, rating, votes, shrinkage m) external_score works from."""
        imdb, imdb_votes = attrs.get("imdb_rating"), attrs.get("imdb_votes")
        if imdb is not None and imdb_votes:
            return "imdb", float(imdb), int(imdb_votes), self.imdb_m
        tmdb = attrs.get("external_rating")
        if tmdb is None:
            return "prior", None, 0, 0
        return "tmdb", float(tmdb), int(attrs.get("external_vote_count") or 0), self.tmdb_m

    def external_score(self, attrs: dict) -> float:
        """0-10 external quality score, Bayesian-shrunk toward the catalog
        mean by vote count. IMDb (rating + votes) is preferred; TMDb's
        vote_average/vote_count is the fallback. No rating -> the prior."""
        source, r, v, m = self.external_inputs(attrs)
        if source == "prior":
            return self.ext_prior
        return (v * r + m * self.ext_prior) / (v + m)

    def blend_with_external(
        self, bayesian: float, external_0_10: float | None, C: float, user_votes: int | None = None
    ) -> float:
        # bayesian/C are on the 1-5 star scale; external_0_10 (and the
        # score this function returns) is 0-10, so rescale before mixing --
        # otherwise a perfect 5-star average tops out at half of a perfect
        # external score and every blended score is compressed/deflated.
        external = external_0_10 if external_0_10 is not None else C * 2
        alpha = self.user_weight(user_votes)
        return round(alpha * (bayesian * 2) + (1 - alpha) * external, 2)

    def user_weight(self, user_votes: int | None) -> float:
        # With no user votes the "user" term is just the platform
        # average -- a constant that only dilutes the external score
        # -- so its weight grows with the votes actually collected.
        if user_votes is None:
            return self.alpha
        return self.alpha * user_votes / (user_votes + self.m)

    def battle_adjustment(self, elo: float | None, matches: int) -> float:
        """Points added to (or taken from) the blended score for battle
        results: Elo's distance from the 1200 start, capped at +/-400,
        scaled by a v/(v+k) confidence on battles played."""
        if elo is None or matches <= 0:
            return 0.0
        strength = max(-1.0, min(1.0, (elo - ELO_BASELINE) / ELO_SPREAD))
        confidence = matches / (matches + self.battle_k)
        return self.battle_weight * confidence * strength

    async def recompute_entity(self, entity: Entity) -> EntityRanking:
        """Recompute and persist the score for a single entity."""
        return (await self.recompute_entities([entity]))[entity.id]

    async def score_breakdowns(self, entities: list[Entity]) -> dict:
        """
        Compute (without writing anything) what each entity's score would be
        now, with every step kept -- the platform average, each entity's
        rating stats and battle stats come back in one query. Returns
        entity id -> ScoreBreakdown.
        """
        if not entities:
            return {}
        ids = [e.id for e in entities]

        rating_stats = (
            select(
                UserRating.entity_id.label("entity_id"),
                func.avg(UserRating.score).label("avg"),
                func.count(UserRating.id).label("votes"),
            )
            .where(UserRating.entity_id.in_(ids))
            .group_by(UserRating.entity_id)
            .subquery()
        )
        stats_stmt = (
            select(
                Entity.id,
                select(func.avg(UserRating.score)).scalar_subquery(),
                rating_stats.c.avg,
                rating_stats.c.votes,
                EntityEloScore.elo_score,
                EntityEloScore.matches_played,
            )
            .outerjoin(rating_stats, rating_stats.c.entity_id == Entity.id)
            # Battle category == entity_type (battles are same-type only).
            .outerjoin(
                EntityEloScore,
                (EntityEloScore.entity_id == Entity.id) & (EntityEloScore.category == Entity.entity_type),
            )
            .where(Entity.id.in_(ids))
        )
        stats = {row[0]: row[1:] for row in (await self.db.execute(stats_stmt)).all()}

        out = {}
        for entity in entities:
            platform_avg, avg, votes, elo, matches = stats[entity.id]
            C = float(platform_avg) if platform_avg is not None else 3.0  # neutral midpoint of the 1-5 scale
            R = float(avg) if avg is not None else None
            v = votes or 0
            attrs = entity.attributes or {}
            bayesian = self.bayesian_score(v, R, C)
            source, ext_rating, ext_votes, _m = self.external_inputs(attrs)
            external = self.external_score(attrs)
            blended = self.blend_with_external(bayesian, external, C, user_votes=v)
            battle = self.battle_adjustment(elo, matches or 0)
            out[entity.id] = ScoreBreakdown(
                platform_avg=C, user_avg=R, user_votes=v, bayesian=bayesian,
                external_source=source, external_rating=ext_rating, external_votes=ext_votes, external=external,
                user_weight=self.user_weight(v), blended=blended,
                elo=float(elo) if elo is not None else None, matches=matches or 0, battle_adjustment=battle,
                final=round(blended + battle, 2),
            )
        return out

    async def recompute_entities(self, entities: list[Entity]) -> dict:
        """
        Recompute and persist the scores of several entities (e.g. both
        sides of a battle) -- same formula as the per-entity helpers above,
        computed by score_breakdowns in one query, with the ranking rows in
        a second, instead of ~6 sequential round trips per entity. Returns
        entity id -> EntityRanking.
        """
        if not entities:
            return {}
        ids = [e.id for e in entities]
        breakdowns = await self.score_breakdowns(entities)

        existing = await self.db.execute(select(EntityRanking).where(EntityRanking.entity_id.in_(ids)))
        rankings = {r.entity_id: r for r in existing.scalars().all()}

        for entity in entities:
            b = breakdowns[entity.id]
            # TMDb rating is 0-10 already; stored in attributes at ingest time
            external_score = entity.attributes.get("external_rating")

            ranking = rankings.get(entity.id)
            if ranking is None:
                ranking = EntityRanking(entity_id=entity.id)
                self.db.add(ranking)
                rankings[entity.id] = ranking

            ranking.avg_user_score = b.user_avg
            ranking.total_votes = b.user_votes
            ranking.external_score = external_score
            ranking.computed_score = b.final

        await self.db.flush()
        return rankings

    async def get_entity_highlights(
        self, entity: Entity, min_group_size: int | None = None
    ) -> list[RankingHighlight]:
        """
        Where an entity ranks within each automatic ranking group it belongs to
        (one group per outgoing edge type in RANKING_DIMENSIONS, e.g. its genres
        or its director's filmography), skipping groups smaller than the threshold.

        Ranking a title inside "Drama" with a window function meant sorting
        every drama on each page view. A group's scores change slowly, so the
        sorted list per group is cached and the rank is a bisect: RANK() OVER
        (ORDER BY score DESC NULLS LAST) == 1 + the number of members with a
        strictly higher score (members without a score share the last rank).
        """
        return await self.highlights_in_groups(entity, await self.get_ranking_groups(entity), min_group_size)

    async def get_ranking_groups(self, entity: Entity) -> list:
        """(relation_type, group id, slug, title, title_fa) of each ranking group the entity belongs to."""
        group_entity = aliased(Entity)
        return (
            await self.db.execute(
                select(
                    RelationshipEdge.relation_type,
                    group_entity.id,
                    group_entity.slug,
                    group_entity.title,
                    group_entity.attributes["title_fa"].astext,
                )
                .join(group_entity, group_entity.id == RelationshipEdge.to_entity_id)
                .where(
                    RelationshipEdge.from_entity_id == entity.id,
                    RelationshipEdge.relation_type.in_(list(RANKING_DIMENSIONS)),
                )
            )
        ).all()

    async def highlights_in_groups(
        self, entity: Entity, own_groups: list, min_group_size: int | None = None
    ) -> list[RankingHighlight]:
        """
        The highlights for groups from get_ranking_groups. Doesn't touch
        self.db: each group's scores load on a session of their own, so a
        caller should close its session first -- holding one connection while
        waiting on several more is how a few concurrent title pages used to
        drain the whole pool and stall every request.
        """
        min_group_size = min_group_size if min_group_size is not None else settings.ranking_group_min_size
        if not own_groups:
            return []

        sizes_and_scores = await parallel.gather(
            *(self._group_scores(rel, group_id, entity.entity_type) for rel, group_id, *_ in own_groups)
        )
        mine = entity.ranking.computed_score if entity.ranking is not None else None

        highlights: list[RankingHighlight] = []
        for (relation_type, group_id, slug, title, title_fa), group in zip(own_groups, sizes_and_scores):
            if group.size < min_group_size:
                continue
            highlights.append(
                RankingHighlight(
                    dimension=RANKING_DIMENSIONS[relation_type],
                    group=RankingGroupRef(id=group_id, slug=slug, title=title, title_fa=title_fa),
                    rank=group.rank_of(mine),
                    group_size=group.size,
                )
            )

        # Ties keep RANKING_DIMENSIONS order (genre, director, creator), as
        # when each dimension was queried and appended in turn.
        dimension_order = list(RANKING_DIMENSIONS.values())
        highlights.sort(key=lambda h: (h.rank, dimension_order.index(h.dimension)))
        return highlights

    async def _group_scores(self, relation_type: str, group_id, entity_type: str) -> "GroupScores":
        async def load() -> GroupScores:
            # Own session: refreshed in the background once stale (see cache.py).
            async with _database.background_read_session() as db:
                member = aliased(Entity)
                rows = await db.execute(
                    select(EntityRanking.computed_score)
                    .select_from(RelationshipEdge)
                    .join(member, member.id == RelationshipEdge.from_entity_id)
                    .outerjoin(EntityRanking, EntityRanking.entity_id == RelationshipEdge.from_entity_id)
                    .where(
                        RelationshipEdge.relation_type == relation_type,
                        RelationshipEdge.to_entity_id == group_id,
                        member.entity_type == entity_type,
                    )
                )
                return GroupScores.from_scores([score for (score,) in rows.all()])

        return await cached(
            ("group-scores", relation_type, group_id, entity_type),
            settings.cache_ttl_group_scores, load, stale_for=settings.cache_stale_seconds,
        )

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
