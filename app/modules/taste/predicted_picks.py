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

GENRE_NEUTRAL_SCORE = 50.0

# How many of the best-ranked unrated titles in the user's genres get scored.
CANDIDATE_POOL_SIZE = 600


class PredictedPick:
    __slots__ = ("entity", "match_score", "reason_genres")

    def __init__(self, entity: Entity, match_score: float, reason_genres: list[str] | None = None):
        self.entity = entity
        self.match_score = match_score
        # The user's liked genres this title has, strongest first -- the
        # "why" shown on the card.
        self.reason_genres = reason_genres or []


# Points an already-picked title sharing a candidate's leading genre costs it,
# so near-tied candidates spread across the user's genres instead of the same
# few platform-wide favorites always filling every slot.
SAME_GENRE_PENALTY = 4.0


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
    
        # 50 is "average" on the genre score: below it the user prefers the
        # genre *less* than the rest, so it shouldn't pull picks toward it.
        liked = [d for d in dimensions if d.score > GENRE_NEUTRAL_SCORE] or dimensions[:1]
        dimension_scores = {
            d.dimension_key: d.score for d in liked
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
    
        # Ranking is 40% of match_score, so only the best-ranked unrated titles
        # in the user's genres can reach the top picks. Scoring just those
        # keeps this from aggregating the whole catalog (it took ~7s).
        in_user_genres = (
            select(RelationshipEdge.id)
            .join(GenreEntity, GenreEntity.id == RelationshipEdge.to_entity_id)
            .where(
                RelationshipEdge.from_entity_id == Entity.id,
                RelationshipEdge.relation_type == "has_genre",
                GenreEntity.slug.in_(list(dimension_scores)),
            )
            .exists()
        )
        candidate_ids = (
            select(Entity.id)
            .join(EntityRanking, EntityRanking.entity_id == Entity.id)
            .where(
                Entity.entity_type.in_(CANDIDATE_ENTITY_TYPES),
                EntityRanking.computed_score.isnot(None),
                ~Entity.id.in_(rated_entity_ids),
                in_user_genres,
            )
            .order_by(EntityRanking.computed_score.desc())
            .limit(CANDIDATE_POOL_SIZE)
        )

        stmt = (
            select(
                Entity.id.label("entity_id"),
                func.avg(genre_score).label("dimension_match"),
                func.array_agg(GenreEntity.slug).label("genre_slugs"),
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
                Entity.id.in_(candidate_ids),
            )
            .group_by(Entity.id, EntityRanking.computed_score)
        )
    
        rows = (await self.db.execute(stmt)).all()
    
        # Preserve the existing Python scoring and rounding behavior.
        scored = []
        top_genres: dict[uuid.UUID, str] = {}
        reasons: dict[uuid.UUID, list[str]] = {}
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
            top_genres[row.entity_id] = max(
                row.genre_slugs, key=lambda slug: dimension_scores.get(slug, 0)
            )
            reasons[row.entity_id] = sorted(
                set(row.genre_slugs), key=lambda slug: -dimension_scores.get(slug, 0)
            )[:2]
    
        scored.sort(key=lambda item: (-item[1], str(item[0])))
        top_scored = self._diversify(scored, top_genres, limit)
    
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
            PredictedPick(entity=entities_by_id[entity_id], match_score=score, reason_genres=reasons.get(entity_id))
            for entity_id, score in top_scored
            if entity_id in entities_by_id
        ]

    @staticmethod
    def _diversify(scored, top_genres, limit):
        """Greedy pick: each round takes the best candidate after penalizing
        genres already represented among the picks."""
        remaining = list(scored)
        picked = []
        genre_counts: dict[str, int] = {}
        while remaining and len(picked) < limit:
            best = max(
                remaining,
                key=lambda item: (
                    item[1] - SAME_GENRE_PENALTY * genre_counts.get(top_genres[item[0]], 0),
                    -item[1],
                    str(item[0]),
                ),
            )
            remaining.remove(best)
            picked.append(best)
            genre = top_genres[best[0]]
            genre_counts[genre] = genre_counts.get(genre, 0) + 1
        return picked
