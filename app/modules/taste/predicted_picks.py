"""
Predicted picks: entities (movie or tv_series) a user hasn't rated yet,
suggested because they share genres with the user's own qualifying Taste
DNA dimensions AND already rank well platform-wide -- not just "more of
the same genre" but "more of the same genre, and it's good". Those
qualifying dimensions (see TasteDimensionComputer.compute_genre_dimensions)
are themselves built from explicit ratings plus the weaker ♥ favorite and
battle-win signals, so a pick can be driven by any of the three without
this module needing to know which.

Unlike everything else in compute.py, this is never persisted: there's
no user_predicted_picks table. It's a live query computed fresh on every
call, since "what haven't they rated yet" only makes sense evaluated at
read time. See predicted_picks_router wiring (taste/router.py) for why
it's a separate endpoint from GET /users/me/taste-dna rather than a field
on that response.
"""
import uuid

from sqlalchemy import case, func, select
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

    
    async def get_predicted_picks(
        self, user_id: uuid.UUID, limit: int = 3
    ) -> list[PredictedPick]:
        dimensions = await self.taste_repo.list_dimensions(
            user_id, dimension_type="genre"
        )
        if not dimensions or limit <= 0:
            return []
    
        dimension_scores = {
            d.dimension_key: d.score for d in dimensions
        }
    
        GenreEntity = aliased(Entity)
    
        rated_entity_ids = select(UserRating.entity_id).where(
            UserRating.user_id == user_id
        )
    
        # Map each matching genre to its Taste DNA score, then
        # calculate the mean score per candidate inside PostgreSQL.
        genre_score = case(
            dimension_scores,
            value=GenreEntity.slug,
            else_=None,
        )
    
        stmt = (
            select(
                Entity.id.label("entity_id"),
                func.avg(genre_score).label("dimension_match"),
                EntityRanking.computed_score.label("computed_score"),
            )
            .join(
                RelationshipEdge,
                (RelationshipEdge.from_entity_id == Entity.id)
                & (RelationshipEdge.relation_type == "has_genre"),
            )
            .join(
                GenreEntity,
                GenreEntity.id == RelationshipEdge.to_entity_id,
            )
            .join(
                EntityRanking,
                EntityRanking.entity_id == Entity.id,
            )
            .where(
                Entity.entity_type.in_(CANDIDATE_ENTITY_TYPES),
                GenreEntity.slug.in_(list(dimension_scores)),
                EntityRanking.computed_score.isnot(None),
                ~Entity.id.in_(rated_entity_ids),
            )
            .group_by(Entity.id, EntityRanking.computed_score)
        )
    
        rows = (await self.db.execute(stmt)).all()
    
        # Preserve the existing Python scoring and rounding behavior.
        scored = []
        for row in rows:
            dimension_match = float(row.dimension_match)
            ranking_normalized = max(
                0.0,
                min(
                    100.0,
                    row.computed_score * RANKING_SCORE_SCALE,
                ),
            )
            match_score = round(
                self.dimension_weight * dimension_match
                + self.ranking_weight * ranking_normalized,
                1,
            )
            scored.append((row.entity_id, match_score))
    
        scored.sort(key=lambda item: (-item[1], str(item[0])))
        top_scored = scored[:limit]
    
        if not top_scored:
            return []
    
        # Load full Entity objects only for the final recommendations.
        entity_ids = [entity_id for entity_id, _ in top_scored]
        entities_result = await self.db.execute(
            select(Entity).where(Entity.id.in_(entity_ids))
        )
        entities_by_id = {
            entity.id: entity for entity in entities_result.scalars().all()
        }
    
        return [
            PredictedPick(entity=entities_by_id[entity_id], match_score=score)
            for entity_id, score in top_scored
            if entity_id in entities_by_id
        ]

