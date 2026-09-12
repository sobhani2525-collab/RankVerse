"""
Computes user_taste_dimensions from raw signal elsewhere in the schema.

This is the write side of the Taste DNA derived-data layer: it never
trusts previous state in user_taste_dimensions, it recomputes a user's
dimensions from scratch each time and replaces whatever was there. That
makes every compute_* method safe to call from either an on-demand path
(e.g. right after a user casts their Nth new vote) or a nightly batch --
there's no incremental state to reconcile between the two callers.

Each dimension_type gets its own compute_<type>_dimensions method built
on the same score/confidence machinery (_rating_component,
_engagement_component, _score_and_confidence). Adding "mood"/"era"/
"theme" later means adding another such method plus its own signal query
-- the shared scoring and persistence path doesn't change.
"""

import math
import uuid
from dataclasses import dataclass

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.entities.models import Entity, RelationshipEdge
from app.modules.taste.repository import TasteRepository
from app.modules.users.models import UserRating

# UserRating.score's actual range (see the ck_rating_range CheckConstraint
# on user_ratings) -- the span between these anchors how far a genre's
# mean rating can deviate from a user's overall average.
RATING_SCALE_MIN = 1
RATING_SCALE_MAX = 10


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


@dataclass
class GenreVote:
    genre_slug: str
    score: int


class TasteDimensionComputer:
    """
    The confidence shrinkage here (sample_size / (sample_size + k)) is the
    same v / (v + m) family RankingService uses for its Bayesian blend
    (app/modules/ranking/service.py) -- just applied to one user's
    per-dimension sample size instead of an entity's vote count. k plays
    the role m plays there: a "how many samples before we trust this"
    knob, tunable via settings instead of hardcoded.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = TasteRepository(db)
        self.confidence_k = settings.taste_dimension_confidence_k
        self.confidence_threshold = settings.taste_dimension_confidence_threshold
        self.rating_weight = settings.taste_dimension_rating_weight
        self.engagement_weight = settings.taste_dimension_engagement_weight

    # --- shared scoring machinery ---

    def _rating_component(self, dimension_mean: float, user_avg: float) -> float:
        """
        0-1, centered at 0.5 when a dimension's mean rating equals the
        user's own overall average rating -- deviation from *their*
        baseline, not the raw 1-10 scale, so a generous rater doesn't end
        up with every dimension showing as "loved".
        """
        deviation = dimension_mean - user_avg
        span = RATING_SCALE_MAX - RATING_SCALE_MIN
        return _clamp01(0.5 + deviation / span)

    def _engagement_component(self, sample_size: int, max_sample_size: int) -> float:
        return math.log(sample_size + 1) / math.log(max_sample_size + 1)

    def _score_and_confidence(
        self, ratings: list[int], user_avg: float, max_sample_size: int
    ) -> tuple[float, float, int]:
        sample_size = len(ratings)
        dimension_mean = sum(ratings) / sample_size

        rating_component = self._rating_component(dimension_mean, user_avg)
        engagement_component = self._engagement_component(sample_size, max_sample_size)

        raw_score = 100 * (self.rating_weight * rating_component + self.engagement_weight * engagement_component)
        score = max(0.0, min(100.0, round(raw_score)))

        confidence = sample_size / (sample_size + self.confidence_k)
        return score, confidence, sample_size

    # --- genre dimension (v1) ---

    async def _genre_votes_for_user(self, user_id: uuid.UUID) -> list[GenreVote]:
        """
        One row per (rated movie, genre it belongs to) -- a movie with
        three genres contributes to all three, each counted in full, no
        weight split, per spec.
        """
        stmt = (
            select(Entity.slug, UserRating.score)
            .select_from(UserRating)
            .join(
                RelationshipEdge,
                (RelationshipEdge.from_entity_id == UserRating.entity_id)
                & (RelationshipEdge.relation_type == "has_genre"),
            )
            .join(Entity, Entity.id == RelationshipEdge.to_entity_id)
            .where(UserRating.user_id == user_id)
        )
        result = await self.db.execute(stmt)
        return [GenreVote(genre_slug=slug, score=score) for slug, score in result.all()]

    async def _overall_avg_rating(self, user_id: uuid.UUID) -> float | None:
        """Mean of ALL of a user's ratings, genre-tagged or not -- the
        normalization baseline, so it has to include everything they've
        rated, not just movies that happen to have genre edges."""
        stmt = select(func.avg(UserRating.score)).where(UserRating.user_id == user_id)
        result = await self.db.execute(stmt)
        avg = result.scalar_one_or_none()
        return float(avg) if avg is not None else None

    async def compute_genre_dimensions(self, user_id: uuid.UUID) -> int:
        """
        Recomputes dimension_type="genre" rows for one user from their
        explicit movie ratings + has_genre relationships. Flushes but does
        NOT commit -- the caller (on-demand trigger or batch loop) owns
        the transaction boundary, same convention as
        RankingService.recompute_entity.

        Returns the number of dimension rows persisted (post-threshold).
        """
        votes = await self._genre_votes_for_user(user_id)
        if not votes:
            await self.repo.bulk_upsert_dimensions(user_id, "genre", [])
            return 0

        user_avg = await self._overall_avg_rating(user_id)

        by_genre: dict[str, list[int]] = {}
        for vote in votes:
            by_genre.setdefault(vote.genre_slug, []).append(vote.score)

        max_sample_size = max(len(scores) for scores in by_genre.values())

        rows = []
        for genre_slug, scores in by_genre.items():
            score, confidence, sample_size = self._score_and_confidence(scores, user_avg, max_sample_size)
            if confidence < self.confidence_threshold:
                continue
            rows.append(
                {
                    "dimension_key": genre_slug,
                    "score": score,
                    "confidence": confidence,
                    "sample_size": sample_size,
                }
            )

        await self.repo.bulk_upsert_dimensions(user_id, "genre", rows)
        return len(rows)

    async def compute_genre_dimensions_batch(self, user_ids: list[uuid.UUID] | None = None) -> int:
        """
        Nightly/batch entry point. Pass explicit user_ids for a partial
        run (e.g. only users with new ratings since the last run); omit
        to recompute every user with at least one rating. Commits once at
        the end, matching RankingService.recompute_all.
        """
        if user_ids is None:
            stmt = select(UserRating.user_id).distinct()
            result = await self.db.execute(stmt)
            user_ids = [row[0] for row in result.all()]

        total = 0
        for user_id in user_ids:
            total += await self.compute_genre_dimensions(user_id)

        await self.db.commit()
        return total
