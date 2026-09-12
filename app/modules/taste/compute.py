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

TasteAnchorComputer, below, fills user_taste_anchors (the movies that
most define a user's taste) and reuses the same _rating_component
normalization TasteDimensionComputer uses, just applied to a single
movie's rating instead of a per-genre mean.

TasteSnapshotComputer rolls a user's already-persisted genre dimensions
into the single-row user_taste_snapshots summary -- it reads what
TasteDimensionComputer wrote, so it must run after it in any call chain.

TasteInsightComputer, last, does the same read but produces a rule-based
(not LLM) Persian insight_text from a fixed template bank
(insight_templates.py), plus insight_tags. Also depends on
TasteDimensionComputer having run first.
"""

import math
import uuid
from dataclasses import dataclass

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.entities.models import Entity, RelationshipEdge
from app.modules.taste.insight_templates import TEMPLATES
from app.modules.taste.repository import TasteRepository
from app.modules.users.models import UserRating

# UserRating.score's actual range (see the ck_rating_range CheckConstraint
# on user_ratings) -- the span between these anchors how far a genre's
# mean rating can deviate from a user's overall average.
RATING_SCALE_MIN = 1
RATING_SCALE_MAX = 10


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _rating_component(value_mean: float, user_avg: float) -> float:
    """
    0-1, centered at 0.5 when a value (a per-genre mean, a single movie's
    rating, ...) equals the user's own overall average rating --
    deviation from *their* baseline, not the raw 1-10 scale, so a
    generous rater doesn't end up with everything showing as "loved".
    Shared by TasteDimensionComputer and TasteAnchorComputer.
    """
    deviation = value_mean - user_avg
    span = RATING_SCALE_MAX - RATING_SCALE_MIN
    return _clamp01(0.5 + deviation / span)


async def _overall_avg_rating(db: AsyncSession, user_id: uuid.UUID) -> float | None:
    """Mean of ALL of a user's ratings -- the normalization baseline
    used by both computers below, so it has to include everything they've
    rated, not just the subset relevant to one particular computation."""
    stmt = select(func.avg(UserRating.score)).where(UserRating.user_id == user_id)
    result = await db.execute(stmt)
    avg = result.scalar_one_or_none()
    return float(avg) if avg is not None else None


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

    def _engagement_component(self, sample_size: int, max_sample_size: int) -> float:
        return math.log(sample_size + 1) / math.log(max_sample_size + 1)

    def _score_and_confidence(
        self, ratings: list[int], user_avg: float, max_sample_size: int
    ) -> tuple[float, float, int]:
        sample_size = len(ratings)
        dimension_mean = sum(ratings) / sample_size

        rating_component = _rating_component(dimension_mean, user_avg)
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

        user_avg = await _overall_avg_rating(self.db, user_id)

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


# --- taste anchors (v1) ---

# Outgoing edge types counted toward a movie's "meaningful relationships"
# for anchor centrality -- the same trio RankingService.RANKING_DIMENSIONS
# and EntityRepository.get_shared_connections() already treat as significant.
ANCHOR_RELATION_TYPES = ("has_genre", "directed_by", "acted_in")

# Fraction of a user's (already top-N) anchor list that gets labeled
# "primary" rather than "strong_signal", by rank position.
ANCHOR_PRIMARY_FRACTION = 0.25


@dataclass
class RatingCandidate:
    entity_id: uuid.UUID
    score: int


class TasteAnchorComputer:
    """
    Picks the handful of movies that most define a user's taste: a blend
    of how much they liked it relative to their own average (reusing
    _rating_component above) and how central that movie is in the
    knowledge graph (genre/director/cast edge count) -- a well-connected
    favorite says more about someone's taste than an obscure one-off
    high rating with no graph context.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = TasteRepository(db)
        self.min_rating = settings.taste_anchor_min_rating
        self.rating_weight = settings.taste_anchor_rating_weight
        self.centrality_weight = settings.taste_anchor_centrality_weight
        self.max_count = settings.taste_anchor_max_count

    async def _candidates(self, user_id: uuid.UUID) -> list[RatingCandidate]:
        stmt = select(UserRating.entity_id, UserRating.score).where(
            UserRating.user_id == user_id, UserRating.score >= self.min_rating
        )
        result = await self.db.execute(stmt)
        return [RatingCandidate(entity_id=entity_id, score=score) for entity_id, score in result.all()]

    async def _relationship_counts(self, entity_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
        """Count of meaningful (genre/director/cast) outgoing edges per
        candidate movie -- its graph centrality, before normalization."""
        if not entity_ids:
            return {}
        stmt = (
            select(RelationshipEdge.from_entity_id, func.count())
            .where(
                RelationshipEdge.from_entity_id.in_(entity_ids),
                RelationshipEdge.relation_type.in_(ANCHOR_RELATION_TYPES),
            )
            .group_by(RelationshipEdge.from_entity_id)
        )
        result = await self.db.execute(stmt)
        return dict(result.all())

    async def compute_anchors(self, user_id: uuid.UUID) -> int:
        """
        Recomputes user_taste_anchors for one user from their high ratings
        (>= taste_anchor_min_rating) blended with graph centrality. Flushes
        but does NOT commit -- same convention as compute_genre_dimensions,
        so this composes with it under one caller-owned transaction.

        Returns the number of anchor rows persisted.
        """
        candidates = await self._candidates(user_id)
        if not candidates:
            await self.repo.bulk_upsert_anchors(user_id, [])
            return 0

        user_avg = await _overall_avg_rating(self.db, user_id)
        centrality_by_entity = await self._relationship_counts([c.entity_id for c in candidates])
        max_centrality = max(centrality_by_entity.values(), default=0)

        scored = []
        for candidate in candidates:
            rating_normalized = _rating_component(candidate.score, user_avg)
            centrality = centrality_by_entity.get(candidate.entity_id, 0)
            centrality_normalized = (centrality / max_centrality) if max_centrality > 0 else 0.0
            anchor_score = self.rating_weight * rating_normalized + self.centrality_weight * centrality_normalized
            scored.append((candidate.entity_id, anchor_score))

        scored.sort(key=lambda item: item[1], reverse=True)
        top = scored[: self.max_count]
        primary_count = math.ceil(ANCHOR_PRIMARY_FRACTION * len(top))

        rows = []
        for position, (entity_id, anchor_score) in enumerate(top, start=1):
            rows.append(
                {
                    "entity_id": entity_id,
                    "anchor_strength": "primary" if position <= primary_count else "strong_signal",
                    "match_score": max(0.0, min(100.0, round(100 * anchor_score))),
                    "rank": position,
                }
            )

        await self.repo.bulk_upsert_anchors(user_id, rows)
        return len(rows)


# --- taste snapshot (v1) ---

# dimension_key (genre slug) -> archetype label. Extend as more TMDb
# genres get seeded; anything missing falls back to a title-cased
# "<Genre> Fan" via _archetype_for().
ARCHETYPE_MAP: dict[str, str] = {
    "sci-fi": "کاوشگر علمی-تخیلی",
    "science-fiction": "کاوشگر علمی-تخیلی",
    "drama": "داستان‌جو",
    "action": "شکارچی هیجان",
    "comedy": "طالب شادی",
    "horror": "طالب دلهره",
    "documentary": "حقیقت‌جو",
    "animation": "شکارچی شگفتی",
    "fantasy": "جهان‌ساز",
    "thriller": "شکارچی تعلیق",
    "romance": "دنباله‌رو دل",
    "crime": "ناظر عدالت",
    "mystery": "حل‌کننده معما",
    "adventure": "افق‌جو",
    "family": "طالب گرمی",
    "music": "دنباله‌رو ریتم",
    "history": "مسافر زمان",
    "war": "شاهد نبرد",
    "western": "سرگردان مرزها",
    "kids": "طالب سادگی",
    "news": "پیگیر رخدادها",
    "reality": "ناظر واقعیت",
    "soap": "دنباله‌رو دل",
    "talk": "شنونده گفت‌وگو",
    "tv-movie": "داستان‌جو",
}

SNAPSHOT_MODEL_VERSION = "genre-v1"
# Revisit once TV series (or other entity_scopes) get their own ratings
# and dimensions -- for now every snapshot is movie-scoped.
SNAPSHOT_ENTITY_SCOPE = "movie"


def _archetype_for(genre_slug: str) -> str:
    if genre_slug in ARCHETYPE_MAP:
        return ARCHETYPE_MAP[genre_slug]
    return f"طرفدار {genre_slug.replace('-', ' ').title()}"


def _dimension_sort_key(dimension):
    """
    score DESC, confidence DESC, sample_size DESC, dimension_key ASC --
    the deterministic tiebreak chain also applied at the DB level in
    TasteRepository.list_dimensions. Shared here so every place that
    picks a "top N dimensions" (snapshot label, insight text/tags) agrees
    on the same order instead of each re-deriving it.
    """
    return (-dimension.score, -dimension.confidence, -dimension.sample_size, dimension.dimension_key)


class TasteSnapshotComputer:
    """
    Rolls the top 1-2 genre dimensions (already confidence-filtered by
    TasteDimensionComputer when they were persisted) into a
    human-readable label + one overall model_confidence for the user's
    Taste DNA profile.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = TasteRepository(db)
        self.confidence_k = settings.taste_snapshot_confidence_k
        self.dimension_weight = settings.taste_snapshot_dimension_weight
        self.vote_weight = settings.taste_snapshot_vote_weight
        self.label_dimension_count = settings.taste_snapshot_label_dimension_count

    async def _total_rated_movies(self, user_id: uuid.UUID) -> int:
        stmt = select(func.count(UserRating.id)).where(UserRating.user_id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one()

    async def compute_snapshot(self, user_id: uuid.UUID, entity_scope: str = SNAPSHOT_ENTITY_SCOPE) -> bool:
        """
        Recomputes the user's single current snapshot row for
        `entity_scope` from their already-persisted genre dimensions --
        expects compute_genre_dimensions to have run first in the same
        call chain. Flushes but does NOT commit, same convention as the
        other compute_* methods.

        Returns whether a snapshot was written; False means the user has
        no qualifying dimensions yet and any prior snapshot was cleared.
        """
        dimensions = await self.repo.list_dimensions(user_id, dimension_type="genre")
        if not dimensions:
            await self.repo.replace_snapshot(user_id, entity_scope, None)
            return False

        # list_dimensions already returns this order from the DB; re-sorting
        # here with the shared tiebreak key makes that guarantee explicit
        # instead of silently relying on the caller not reordering the list.
        top = sorted(dimensions, key=_dimension_sort_key)[: self.label_dimension_count]
        label = " + ".join(_archetype_for(d.dimension_key) for d in top)
        dimension_confidence_avg = sum(d.confidence for d in top) / len(top)

        total_rated_movies = await self._total_rated_movies(user_id)
        overall_vote_shrinkage = total_rated_movies / (total_rated_movies + self.confidence_k)

        model_confidence = _clamp01(
            self.dimension_weight * dimension_confidence_avg + self.vote_weight * overall_vote_shrinkage
        )

        await self.repo.replace_snapshot(
            user_id,
            entity_scope,
            {
                "label": label[:120],
                "model_confidence": model_confidence,
                "model_version": SNAPSHOT_MODEL_VERSION,
            },
        )
        return True


# --- taste insight (v1, rule-based) ---

BREADTH_LOYALIST = "loyalist"
BREADTH_BALANCED_EXPLORER = "balanced_explorer"
BREADTH_ECLECTIC_EXPLORER = "eclectic_explorer"


class TasteInsightComputer:
    """
    Turns a user's already-persisted genre dimensions into one Persian
    insight_text, picked from a fixed template bank (insight_templates.py)
    -- no LLM call. Reuses ARCHETYPE_MAP/_archetype_for from
    TasteSnapshotComputer's section above instead of redefining it, and
    the same _dimension_sort_key for "top N dimensions" ordering.

    NOTE on insight_tags: the model column (user_taste_insights.insight_tags,
    JSONB) and the read schema (TasteInsightPublic.insight_tags: list[str])
    are both shaped as a plain list, so this stores the top-3 archetype
    *labels* as a list of strings -- not a {label: score} dict. A dict
    would round-trip through the DB fine (JSONB doesn't care), but would
    fail Pydantic validation on read. If a scored dict is actually wanted,
    that's a small follow-up touching models.py's type hint and
    schemas.py's TasteInsightPublic, not just this method.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = TasteRepository(db)

    def _breadth_category(self, qualifying_count: int) -> str:
        if qualifying_count == 1:
            return BREADTH_LOYALIST
        if qualifying_count <= 3:
            return BREADTH_BALANCED_EXPLORER
        return BREADTH_ECLECTIC_EXPLORER

    def _pick_template(self, user_id: uuid.UUID, category: str) -> str:
        """
        Deterministic per user, not random and not Python's hash() --
        hash() on a str is salted per-process (PYTHONHASHSEED) so
        hash(str(user_id)) would pick a different template after every
        app restart even with identical data. uuid.UUID.int is a plain
        128-bit integer with no hashing involved, so this is stable
        forever for a given user_id.
        """
        options = TEMPLATES[category]
        return options[user_id.int % len(options)]

    async def compute_insight(self, user_id: uuid.UUID) -> bool:
        """
        Recomputes the user's single current insight row from their
        already-persisted dimension_type="genre" rows -- expects
        compute_genre_dimensions to have run first in the same call
        chain (same dependency TasteSnapshotComputer has). Flushes but
        does NOT commit.

        Returns whether an insight was written; False means the user has
        no qualifying dimensions yet and any prior insight was cleared.
        """
        dimensions = await self.repo.list_dimensions(user_id, dimension_type="genre")
        if not dimensions:
            await self.repo.replace_insight(user_id, None)
            return False

        ranked = sorted(dimensions, key=_dimension_sort_key)
        category = self._breadth_category(len(ranked))
        template = self._pick_template(user_id, category)

        if category == BREADTH_LOYALIST:
            text = template.format(archetype=_archetype_for(ranked[0].dimension_key))
        else:
            top_two = ranked[:2]
            text = template.format(
                archetype1=_archetype_for(top_two[0].dimension_key),
                archetype2=_archetype_for(top_two[1].dimension_key),
            )

        tags = [_archetype_for(d.dimension_key) for d in ranked[:3]]

        await self.repo.replace_insight(user_id, {"insight_text": text, "insight_tags": tags})
        return True
