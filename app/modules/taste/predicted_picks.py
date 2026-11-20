"""
Predicted picks: ranked movies and TV series a user has yet to rate or like.
Genres come from Taste DNA and recurring patterns in live favorites.

Unlike everything else in compute.py, this is never persisted: there's
no user_predicted_picks table. It's a live query computed fresh on every
call, since "what haven't they rated yet" only makes sense evaluated at
read time. See predicted_picks_router wiring (taste/router.py) for why
it's a separate endpoint from GET /users/me/taste-dna rather than a field
on that response.
"""
import uuid
from collections import Counter

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.config import settings
from app.modules.entities.models import Entity, EntityRanking, RelationshipEdge
from app.modules.taste.repository import TasteRepository
from app.modules.users.models import UserFavorite, UserRating


# Battles are movie-vs-movie or tv-vs-tv only (see BattleService._validate_matchup);
# predicted picks draws from the same two entity types users actually rate.
CANDIDATE_ENTITY_TYPES = ("movie", "tv_series")

# computed_score is 0-10 (see RankingService's docstring); dimension.score
# is already 0-100. Scaling the former up, not the latter down, keeps
# match_score on the same 0-100 scale the rest of Taste DNA's percentages use.
RANKING_SCORE_SCALE = 10

GENRE_NEUTRAL_SCORE = 50.0
BROAD_GENRES = {"drama", "comedy", "action", "adventure"}
MAX_GENRE_AFFINITY = 95.0
MAX_OVERLAP_BONUS = 12.0
FORMAT_BONUS = 6.0

# Bound the number of relevance-ranked candidates sent to diversification.
CANDIDATE_POOL_SIZE = 600

FavoriteSignal = tuple[uuid.UUID, str, str | None]


def favorite_genre_scores(favorites: tuple[FavoriteSignal, ...]) -> dict[str, float]:
    """Each distinct liked title contributes once per genre."""
    counts = Counter(slug for _, _, slug in set(favorites) if slug)
    return {
        slug: min(66.0, 52.0 + 5 * (count - 1)) if slug in BROAD_GENRES
        else min(MAX_GENRE_AFFINITY, 65.0 + 9 * (count - 1))
        for slug, count in counts.items()
    }


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
SAME_GENRE_PENALTY = 6.0


class PredictedPicksService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.taste_repo = TasteRepository(db)
        self.dimension_weight = settings.taste_predicted_picks_dimension_weight
        self.ranking_weight = settings.taste_predicted_picks_ranking_weight

    async def favorite_signals(self, user_id: uuid.UUID) -> tuple[FavoriteSignal, ...]:
        """Read current likes, with a genre signal only for unrated titles."""
        genre = aliased(Entity)
        rated = (
            select(UserRating.entity_id)
            .where(UserRating.user_id == user_id, UserRating.entity_id == UserFavorite.entity_id)
            .correlate(UserFavorite)
            .exists()
        )
        stmt = (
            select(UserFavorite.entity_id, Entity.entity_type, case((~rated, genre.slug)).label("genre"))
            .select_from(UserFavorite)
            .join(Entity, Entity.id == UserFavorite.entity_id)
            .outerjoin(
                RelationshipEdge,
                (RelationshipEdge.from_entity_id == UserFavorite.entity_id)
                & (RelationshipEdge.relation_type == "has_genre"),
            )
            .outerjoin(genre, genre.id == RelationshipEdge.to_entity_id)
            .where(UserFavorite.user_id == user_id, Entity.entity_type.in_(CANDIDATE_ENTITY_TYPES))
            .distinct()
        )
        rows = (await self.db.execute(stmt)).all()
        return tuple(sorted(
            ((entity_id, entity_type, slug) for entity_id, entity_type, slug in rows),
            key=lambda signal: (signal[0], signal[1], signal[2] or ""),
        ))

    async def get_predicted_picks(
        self, user_id: uuid.UUID, limit: int = 3,
        *, favorites: tuple[FavoriteSignal, ...] | None = None,
    ) -> list[PredictedPick]:
        dimensions = await self.taste_repo.list_dimensions(
            user_id, dimension_type="genre"
        )
        if limit <= 0:
            return []
        if favorites is None:
            favorites = await self.favorite_signals(user_id)
    
        # 50 is "average" on the genre score: below it the user prefers the
        # genre *less* than the rest, so it shouldn't pull picks toward it.
        liked = [d for d in dimensions if d.score > GENRE_NEUTRAL_SCORE] or dimensions[:1]
        dimension_scores = {
            d.dimension_key: d.score for d in liked
        }
        favorite_scores = favorite_genre_scores(favorites)
        for slug, score in favorite_scores.items():
            dimension_scores[slug] = max(dimension_scores.get(slug, 0), score)
        if not dimension_scores:
            return []
        favorite_ids = {entity_id for entity_id, _, _ in favorites}
    
        GenreEntity = aliased(Entity)
    
        rated_entity_ids = select(UserRating.entity_id).where(
            UserRating.user_id == user_id
        )
    
        genre_score = case(
            dimension_scores,
            value=GenreEntity.slug,
            else_=None,
        )
    
        affinity = func.avg(genre_score)
        if favorite_scores:
            # Strong individual matches survive alongside broad secondary
            # matches. Multiple specific tastes give a bounded extra boost.
            specific_matches = func.count(GenreEntity.slug.distinct()).filter(
                GenreEntity.slug.in_(favorite_scores.keys() - BROAD_GENRES)
            )
            favorite_formats = {entity_id: kind for entity_id, kind, _ in favorites}
            formats = Counter(favorite_formats.values())
            total = sum(formats.values())
            format_score = case(
                {kind: FORMAT_BONUS * count / total for kind, count in formats.items()},
                value=Entity.entity_type,
                else_=0,
            )
            affinity = func.least(
                100.0,
                0.7 * func.max(genre_score) + 0.3 * affinity
                + func.least(MAX_OVERLAP_BONUS, 8 * func.greatest(0, specific_matches - 1))
                + format_score,
            )
        ranking = func.greatest(0.0, func.least(100.0, EntityRanking.computed_score * RANKING_SCORE_SCALE))
        relevance = self.dimension_weight * affinity + self.ranking_weight * ranking

        stmt = (
            select(
                Entity.id.label("entity_id"),
                relevance.label("relevance"),
                func.array_agg(GenreEntity.slug).label("genre_slugs"),
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
                Entity.id.not_in(rated_entity_ids),
            )
            .group_by(Entity.id, EntityRanking.computed_score)
            .order_by(relevance.desc(), Entity.id)
            .limit(CANDIDATE_POOL_SIZE)
        )
        if favorite_ids:
            stmt = stmt.where(Entity.id.not_in(favorite_ids))
    
        rows = (await self.db.execute(stmt)).all()
    
        scored = []
        top_genres: dict[uuid.UUID, str] = {}
        reasons: dict[uuid.UUID, list[str]] = {}
        for row in rows:
            match_score = round(float(row.relevance), 1)
            scored.append((row.entity_id, match_score))
            reasons[row.entity_id] = sorted(
                set(row.genre_slugs),
                key=lambda slug: (-dimension_scores[slug], slug in BROAD_GENRES, slug),
            )[:2]
            top_genres[row.entity_id] = reasons[row.entity_id][0]
    
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
                    item[1],
                    str(item[0]),
                ),
            )
            remaining.remove(best)
            picked.append(best)
            genre = top_genres[best[0]]
            genre_counts[genre] = genre_counts.get(genre, 0) + 1
        return picked
