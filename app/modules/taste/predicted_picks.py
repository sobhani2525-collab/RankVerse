"""
Predicted picks: entities (movie or tv_series) a user hasn't rated yet,
suggested because they share genres with the user's own qualifying Taste
DNA dimensions AND already rank well platform-wide -- not just "more of
the same genre" but "more of the same genre, and it's good".

Unlike everything else in compute.py, this is never persisted: there's
no user_predicted_picks table. It's a live query computed fresh on every
call, since "what haven't they rated yet" only makes sense evaluated at
read time. See predicted_picks_router wiring (taste/router.py) for why
it's a separate endpoint from GET /users/me/taste-dna rather than a field
on that response.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.config import settings
from app.modules.entities.models import Entity, EntityRanking, RelationshipEdge
from app.modules.taste.repository import TasteRepository
from app.modules.users.models import UserRating

# Battles are movie-vs-movie or tv-vs-tv only (see BattleService._validate_matchup);
# predicted picks draws from the same two entity types users actually rate.
CANDIDATE_ENTITY_TYPES = ("movie", "tv_series")

# computed_score is 0-10 (see RankingService's docstring); dimension.score
# is already 0-100. Scaling the former up, not the latter down, keeps
# match_score on the same 0-100 scale the rest of Taste DNA's percentages use.
RANKING_SCORE_SCALE = 10


class PredictedPick:
    __slots__ = ("entity", "match_score")

    def __init__(self, entity: Entity, match_score: float):
        self.entity = entity
        self.match_score = match_score


class PredictedPicksService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.taste_repo = TasteRepository(db)
        self.dimension_weight = settings.taste_predicted_picks_dimension_weight
        self.ranking_weight = settings.taste_predicted_picks_ranking_weight

    async def get_predicted_picks(self, user_id: uuid.UUID, limit: int = 3) -> list[PredictedPick]:
        dimensions = await self.taste_repo.list_dimensions(user_id, dimension_type="genre")
        if not dimensions:
            return []
        dimension_scores = {d.dimension_key: d.score for d in dimensions}

        GenreEntity = aliased(Entity)
        rated_entity_ids = select(UserRating.entity_id).where(UserRating.user_id == user_id)

        stmt = (
            select(Entity, GenreEntity.slug, EntityRanking.computed_score)
            .join(
                RelationshipEdge,
                (RelationshipEdge.from_entity_id == Entity.id)
                & (RelationshipEdge.relation_type == "has_genre"),
            )
            .join(GenreEntity, GenreEntity.id == RelationshipEdge.to_entity_id)
            .join(EntityRanking, EntityRanking.entity_id == Entity.id)
            .where(
                Entity.entity_type.in_(CANDIDATE_ENTITY_TYPES),
                GenreEntity.slug.in_(dimension_scores.keys()),
                EntityRanking.computed_score.isnot(None),
                ~Entity.id.in_(rated_entity_ids),
            )
        )
        rows = (await self.db.execute(stmt)).all()

        # A candidate can match more than one qualifying genre (e.g. a
        # drama+thriller movie when both dimensions qualify) -- group by
        # entity so it's scored once, from the mean of every dimension it
        # matched, not counted (and potentially returned) once per genre.
        matched: dict[uuid.UUID, dict] = {}
        for entity, genre_slug, computed_score in rows:
            bucket = matched.setdefault(
                entity.id, {"entity": entity, "computed_score": computed_score, "scores": []}
            )
            bucket["scores"].append(dimension_scores[genre_slug])

        picks = []
        for bucket in matched.values():
            dimension_match = sum(bucket["scores"]) / len(bucket["scores"])
            ranking_normalized = max(0.0, min(100.0, bucket["computed_score"] * RANKING_SCORE_SCALE))
            match_score = round(
                self.dimension_weight * dimension_match + self.ranking_weight * ranking_normalized, 1
            )
            picks.append(PredictedPick(entity=bucket["entity"], match_score=match_score))

        # Deterministic tiebreak, same pattern as _dimension_sort_key in
        # compute.py: score desc, then a stable identifier so ties don't
        # depend on dict/query iteration order.
        picks.sort(key=lambda p: (-p.match_score, str(p.entity.id)))
        return picks[:limit]
