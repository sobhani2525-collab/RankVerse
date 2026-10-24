"""
Computes user_taste_dimensions from raw signal elsewhere in the schema.

This is the write side of the Taste DNA derived-data layer: it never
trusts previous state in user_taste_dimensions, it recomputes a user's
dimensions from scratch each time and replaces whatever was there. That
makes every compute_* method safe to call from either an on-demand path
(e.g. right after a user casts their Nth new vote) or a nightly batch --
there's no incremental state to reconcile between the two callers.

TasteDimensionComputer writes three rows per genre: "genre" (the blended
score), plus "genre_affinity" and "genre_lift" (its preference and choice
halves) -- see the constants above it. TasteFacetComputer adds the
director/actor/decade/country dimensions behind the titles a user likes.

TasteAnchorComputer, below, fills user_taste_anchors (the movies that
most define a user's taste) and reuses the same _rating_component
normalization TasteDimensionComputer uses, just applied to a single
movie's rating instead of a per-genre mean.

TasteSnapshotComputer rolls a user's already-persisted genre dimensions
into the single-row user_taste_snapshots summary -- it reads what
TasteDimensionComputer wrote, so it must run after it in any call chain.

TasteInsightComputer, last, does the same read but builds a rule-based
(not LLM) Persian reading of the numbers (build_insight; sentences in
insight_templates.py), plus insight_tags. Also depends on
TasteDimensionComputer having run first.
"""

import math
import uuid
from datetime import datetime
from dataclasses import dataclass, field

from sqlalchemy import case, func, literal, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.config import settings
from app.core.cache import cached
from app.modules.battles.models import PairVote, VoteOutcome
from app.modules.entities.models import Entity, EntityRanking, RelationshipEdge
from app.modules.lists.models import ListComment
from app.modules.taste.insight_templates import INSIGHT_SENTENCES, genre_fa
from app.modules.taste.repository import TasteRepository
from app.modules.users.models import UserFavorite, UserRating

# UserRating.score's actual range (see the ck_rating_range CheckConstraint
# on user_ratings) -- the span between these anchors how far a genre's
# mean rating can deviate from a user's overall average. Migrated from
# 1-10 to 1-5 (see alembic/versions/*_rescale_user_ratings_to_five_stars.py);
# _rating_component normalizes relative to each user's own baseline, so
# updating this span is the only change this pipeline needs for the new
# scale -- no other normalization logic here is scale-dependent.
RATING_SCALE_MIN = 1
RATING_SCALE_MAX = 5


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


# Two extra dimension_type rows are written next to every "genre" row (same
# dimension_key, confidence and sample_size), so the profile can show *why*
# a genre scores what it does -- the preference half and the choice half of
# the score -- without a schema change:
#   genre_affinity: 100 * preference, 50 = neutral (see _genre_affinity)
#   genre_lift:     LIFT_STORE_SCALE * lift over the base rate, capped at 100
GENRE_DIMENSION_TYPE = "genre"
GENRE_AFFINITY_TYPE = "genre_affinity"
GENRE_LIFT_TYPE = "genre_lift"
LIFT_STORE_SCALE = 20  # stored 0-100 <-> lift 0x-5x
MAX_LIFT = 100 / LIFT_STORE_SCALE

# This many neutral (0.5) pseudo-signals are mixed into every genre's
# preference, so one battle win or one 5-star rating can't read as 100.
AFFINITY_PRIOR = 3.0
# A rating this many stars above the user's own average maxes out its
# preference component (and the same distance below bottoms it out).
AFFINITY_SPAN_STARS = 2.0
# Lift shrinkage toward 1x, in pseudo-items drawn at the base rate.
LIFT_PRIOR = 12.0
# Titles the user must have chosen (rated or ♥) before lift counts at all --
# two ratings can't say someone picks thrillers "4.5x more than average".
LIFT_MIN_CHOSEN = 8
# The catalog's own genre mix, in pseudo-items, blended into the platform's
# base rate -- keeps the base rate sane while the platform has few users.
CATALOG_BASE_WEIGHT = 200.0
GENRE_BASE_RATES_TTL = 3600


# Battle results are judged against what the two titles' platform scores
# (EntityRanking.computed_score, 0-10) already predict: a gap of this many
# points makes the better title ~73% likely to win (logistic). Without it,
# genres made mostly of acclaimed titles (music, family, ...) "won" most
# battles simply because their titles are good -- read as a taste for the
# genre when it was a taste for good films.
BATTLE_QUALITY_SCALE = 1.0


def expected_win(score: float | None, other: float | None) -> float:
    if score is None or other is None:
        return 0.5
    return 1 / (1 + math.exp(-(score - other) / BATTLE_QUALITY_SCALE))


@dataclass
class GenreSignals:
    # Explicit ratings plus ♥ pseudo-ratings: titles the user chose to
    # watch/mark, the only signals that say anything about how *often* they
    # pick a genre (battle pairs are assigned to them, not chosen).
    ratings: list[float] = field(default_factory=list)
    # One per battle where only one side had this genre: the result minus
    # the quality-expected result for that side (see expected_win), -1..1.
    battle_residuals: list[float] = field(default_factory=list)

    @property
    def chosen(self) -> int:
        return len(self.ratings)

    @property
    def sample_size(self) -> int:
        return len(self.ratings) + len(self.battle_residuals)


@dataclass
class GenreStat:
    """One genre of a user's profile, merged from its three dimension rows."""
    dimension_key: str
    score: float
    confidence: float
    sample_size: int
    affinity: float | None  # 0-1, 0.5 = neutral
    lift: float | None  # x times the base rate, 1.0 = average
    updated_at: datetime | None = None


def _genre_sort_key(stat):
    return (-stat.score, -stat.confidence, -stat.sample_size, stat.dimension_key)


def genre_stats_from_rows(rows) -> list[GenreStat]:
    """Merges a user's genre rows with their affinity/lift companions (rows
    of any other dimension_type are ignored), score DESC with the same
    tiebreak chain as TasteRepository.list_dimensions."""
    affinity = {r.dimension_key: r.score / 100 for r in rows if r.dimension_type == GENRE_AFFINITY_TYPE}
    lift = {r.dimension_key: r.score / LIFT_STORE_SCALE for r in rows if r.dimension_type == GENRE_LIFT_TYPE}
    stats = [
        GenreStat(
            dimension_key=r.dimension_key,
            score=r.score,
            confidence=r.confidence,
            sample_size=r.sample_size,
            affinity=affinity.get(r.dimension_key),
            lift=lift.get(r.dimension_key),
            updated_at=r.updated_at,
        )
        for r in rows
        if r.dimension_type == GENRE_DIMENSION_TYPE
    ]
    return sorted(stats, key=_genre_sort_key)


async def load_genre_stats(repo: TasteRepository, user_id: uuid.UUID) -> list[GenreStat]:
    rows = await repo.list_dimensions(
        user_id, dimension_type=(GENRE_DIMENSION_TYPE, GENRE_AFFINITY_TYPE, GENRE_LIFT_TYPE)
    )
    return genre_stats_from_rows(rows)


async def genre_base_rates(db: AsyncSession) -> dict[str, float]:
    """
    Share of each genre among what the platform's users choose (ratings +
    ♥, one row per title-genre pair), blended with the catalog's own genre
    mix (CATALOG_BASE_WEIGHT pseudo-items). This is the "average user" a
    user's own genre mix is compared against: drama is in most titles, so
    rating a lot of dramas is not, by itself, a taste for drama.
    """
    async def load():
        chosen = union_all(select(UserRating.entity_id), select(UserFavorite.entity_id)).subquery()
        platform_stmt = (
            select(Entity.slug, func.count())
            .select_from(chosen)
            .join(
                RelationshipEdge,
                (RelationshipEdge.from_entity_id == chosen.c.entity_id)
                & (RelationshipEdge.relation_type == "has_genre"),
            )
            .join(Entity, Entity.id == RelationshipEdge.to_entity_id)
            .group_by(Entity.slug)
        )
        catalog_stmt = (
            select(Entity.slug, func.count())
            .select_from(RelationshipEdge)
            .join(Entity, Entity.id == RelationshipEdge.to_entity_id)
            .where(RelationshipEdge.relation_type == "has_genre")
            .group_by(Entity.slug)
        )
        platform = dict((await db.execute(platform_stmt)).all())
        catalog = dict((await db.execute(catalog_stmt)).all())
        platform_total = sum(platform.values())
        catalog_total = sum(catalog.values())
        if platform_total + catalog_total == 0:
            return {}
        catalog_weight = CATALOG_BASE_WEIGHT if catalog_total else 0.0
        denominator = platform_total + catalog_weight
        return {
            slug: (platform.get(slug, 0) + catalog_weight * catalog.get(slug, 0) / (catalog_total or 1)) / denominator
            for slug in set(platform) | set(catalog)
        }

    return await cached(("taste-genre-base-rates",), GENRE_BASE_RATES_TTL, load)


class TasteDimensionComputer:
    """
    A genre's score is two separate questions blended together:

      * preference -- does the user like this genre more than the rest of
        what they watch? Explicit ratings relative to *their own* average
        (so a generous rater doesn't love everything), ♥ favorites, and how
        the genre does in their battles beyond what the titles' platform
        scores predict (_battle_genre_residuals_for_user -- a battle is never
        turned into a pseudo-rating, so it can't be misread as "below their
        average", and a good film winning isn't read as a genre taste).
      * choice lift -- do they pick this genre more often than the
        platform's users do? Their share of the genre among the titles they
        chose (ratings + ♥) over the base rate from genre_base_rates.
        Without this, drama and comedy -- simply the most common genres --
        topped every profile.

    Both are shrunk toward neutral by a prior (AFFINITY_PRIOR, LIFT_PRIOR)
    and blended as taste_dimension_rating_weight : _engagement_weight into
    a 0-100 score where 50 means "average". The confidence shrinkage
    (sample_size / (sample_size + k)) is the same v / (v + m) family
    RankingService uses for its Bayesian blend.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = TasteRepository(db)
        self.confidence_k = settings.taste_dimension_confidence_k
        self.confidence_threshold = settings.taste_dimension_confidence_threshold
        self.preference_weight = settings.taste_dimension_rating_weight
        self.lift_weight = settings.taste_dimension_engagement_weight
        self.battle_weight = settings.taste_battle_signal_weight

    # --- signal queries ---

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

    async def _favorited_unrated_genre_slugs_for_user(self, user_id: uuid.UUID) -> list[str]:
        """
        One row per (favorited-but-not-rated movie, genre it belongs to) --
        the ♥ counterpart of _genre_votes_for_user, for the weaker implicit
        signal. An entity the user has ALSO rated is excluded entirely: the
        explicit rating is strictly more informative for that same movie,
        so it's used instead of, never alongside, the favorite pseudo-score.
        """
        rated_entity_ids = select(UserRating.entity_id).where(UserRating.user_id == user_id)
        stmt = (
            select(Entity.slug)
            .select_from(UserFavorite)
            .join(
                RelationshipEdge,
                (RelationshipEdge.from_entity_id == UserFavorite.entity_id)
                & (RelationshipEdge.relation_type == "has_genre"),
            )
            .join(Entity, Entity.id == RelationshipEdge.to_entity_id)
            .where(UserFavorite.user_id == user_id, UserFavorite.entity_id.not_in(rated_entity_ids))
        )
        result = await self.db.execute(stmt)
        return [slug for (slug,) in result.all()]

    async def _battle_genre_residuals_for_user(self, user_id: uuid.UUID) -> list[tuple[str, float]]:
        """
        One (genre slug, residual) per genre that only one side of a
        non-skip battle vote had: the side's result (1 won, 0 lost) minus
        its quality-expected result. A genre both titles share says nothing
        about that vote and is skipped. Picking a much better-rated title is
        a small positive signal; picking the weaker one is a strong one.
        """
        left_won = PairVote.winner == VoteOutcome.LEFT
        WonRank = aliased(EntityRanking)
        LostRank = aliased(EntityRanking)
        won_id = case((left_won, PairVote.left_item), else_=PairVote.right_item)
        lost_id = case((left_won, PairVote.right_item), else_=PairVote.left_item)
        votes_stmt = (
            select(won_id.label("won_id"), lost_id.label("lost_id"), WonRank.computed_score, LostRank.computed_score)
            .select_from(PairVote)
            .outerjoin(WonRank, WonRank.entity_id == won_id)
            .outerjoin(LostRank, LostRank.entity_id == lost_id)
            .where(PairVote.user_id == user_id, PairVote.winner != VoteOutcome.SKIP)
        )
        votes = (await self.db.execute(votes_stmt)).all()
        if not votes:
            return []

        entity_ids = {v.won_id for v in votes} | {v.lost_id for v in votes}
        genres_stmt = (
            select(RelationshipEdge.from_entity_id, Entity.slug)
            .join(Entity, Entity.id == RelationshipEdge.to_entity_id)
            .where(RelationshipEdge.relation_type == "has_genre", RelationshipEdge.from_entity_id.in_(entity_ids))
        )
        genres: dict[uuid.UUID, set[str]] = {}
        for entity_id, slug in (await self.db.execute(genres_stmt)).all():
            genres.setdefault(entity_id, set()).add(slug)

        out = []
        for won, lost, won_score, lost_score in votes:
            e_won = expected_win(won_score, lost_score)
            won_genres, lost_genres = genres.get(won, set()), genres.get(lost, set())
            out += [(g, 1 - e_won) for g in won_genres - lost_genres]
            out += [(g, -(1 - e_won)) for g in lost_genres - won_genres]
        return out

    # --- scoring ---

    def _genre_affinity(self, signals: GenreSignals, user_avg: float) -> float:
        weighted = sum(_clamp01(0.5 + (r - user_avg) / AFFINITY_SPAN_STARS) for r in signals.ratings)
        weight = float(len(signals.ratings))
        # An even matchup won scores 1, lost 0; a predictable result ~0.5.
        weighted += self.battle_weight * sum(_clamp01(0.5 + r) for r in signals.battle_residuals)
        weight += self.battle_weight * len(signals.battle_residuals)
        return (weighted + AFFINITY_PRIOR * 0.5) / (weight + AFFINITY_PRIOR)

    @staticmethod
    def _genre_lift(chosen: int, total_chosen: int, base_rate: float) -> float:
        if total_chosen < LIFT_MIN_CHOSEN or base_rate <= 0:
            return 1.0
        share = (chosen + LIFT_PRIOR * base_rate) / (total_chosen + LIFT_PRIOR)
        return min(MAX_LIFT, share / base_rate)

    async def compute_genre_dimensions(self, user_id: uuid.UUID) -> int:
        """
        Recomputes the user's genre / genre_affinity / genre_lift rows from
        their ratings, ♥ favorites and battle votes. Flushes but does NOT
        commit -- the caller (on-demand trigger or batch loop) owns the
        transaction boundary, same convention as RankingService.recompute_entity.

        Returns the number of genre rows persisted (post-threshold).
        """
        votes = await self._genre_votes_for_user(user_id)
        favorite_genre_slugs = await self._favorited_unrated_genre_slugs_for_user(user_id)
        battle_residuals = await self._battle_genre_residuals_for_user(user_id)
        if not votes and not favorite_genre_slugs and not battle_residuals:
            for dimension_type in (GENRE_DIMENSION_TYPE, GENRE_AFFINITY_TYPE, GENRE_LIFT_TYPE):
                await self.repo.bulk_upsert_dimensions(user_id, dimension_type, [])
            return 0

        user_avg = await _overall_avg_rating(self.db, user_id)
        if user_avg is None:
            # A favorites/battles-only user has no explicit ratings to
            # establish a baseline -- fall back to the scale midpoint, same
            # convention as RankingService.recompute_entities' platform-average
            # default.
            user_avg = (RATING_SCALE_MIN + RATING_SCALE_MAX) / 2
        favorite_pseudo_rating = min(
            RATING_SCALE_MAX, max(settings.taste_favorite_rating_equivalent, user_avg + 0.5)
        )

        by_genre: dict[str, GenreSignals] = {}
        for vote in votes:
            by_genre.setdefault(vote.genre_slug, GenreSignals()).ratings.append(vote.score)
        for genre_slug in favorite_genre_slugs:
            by_genre.setdefault(genre_slug, GenreSignals()).ratings.append(favorite_pseudo_rating)
        for genre_slug, residual in battle_residuals:
            by_genre.setdefault(genre_slug, GenreSignals()).battle_residuals.append(residual)

        base_rates = await genre_base_rates(self.db)
        total_chosen = sum(s.chosen for s in by_genre.values())
        lift_weight = self.lift_weight if total_chosen >= LIFT_MIN_CHOSEN else 0.0

        genre_rows, affinity_rows, lift_rows = [], [], []
        for genre_slug, signals in by_genre.items():
            confidence = signals.sample_size / (signals.sample_size + self.confidence_k)
            if confidence < self.confidence_threshold:
                continue
            affinity = self._genre_affinity(signals, user_avg)
            lift = self._genre_lift(signals.chosen, total_chosen, base_rates.get(genre_slug, 0.0))
            # tanh(ln x) maps lift onto -1..1 symmetrically: 2x -> +0.6, 0.5x -> -0.6.
            lift_component = 0.5 + 0.5 * math.tanh(math.log(lift))
            blended = (self.preference_weight * affinity + lift_weight * lift_component) / (
                self.preference_weight + lift_weight
            )
            common = {"dimension_key": genre_slug, "confidence": confidence, "sample_size": signals.sample_size}
            genre_rows.append({**common, "score": max(0.0, min(100.0, round(100 * blended, 1)))})
            affinity_rows.append({**common, "score": round(100 * affinity, 1)})
            if lift_weight:
                lift_rows.append({**common, "score": min(100.0, round(LIFT_STORE_SCALE * lift, 2))})

        await self.repo.bulk_upsert_dimensions(user_id, GENRE_DIMENSION_TYPE, genre_rows)
        await self.repo.bulk_upsert_dimensions(user_id, GENRE_AFFINITY_TYPE, affinity_rows)
        await self.repo.bulk_upsert_dimensions(user_id, GENRE_LIFT_TYPE, lift_rows)
        return len(genre_rows)

    async def compute_genre_dimensions_batch(self, user_ids: list[uuid.UUID] | None = None) -> int:
        """
        Nightly/batch entry point. Pass explicit user_ids for a partial
        run (e.g. only users with new ratings/favorites/battle votes since
        the last run); omit to recompute every user with at least one
        rating, favorite, OR battle vote. Commits once at the end, matching
        RankingService.recompute_all.
        """
        if user_ids is None:
            rated_ids = select(UserRating.user_id)
            favorited_ids = select(UserFavorite.user_id)
            voted_ids = select(PairVote.user_id)
            stmt = rated_ids.union(favorited_ids).union(voted_ids)
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


# --- taste snapshot (v2) ---

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

# genre-v2(.1): scores are preference + lift over the platform base rate, with
# genre_affinity/genre_lift companion rows and the facet dimensions. A
# snapshot with an older version is recomputed on the next profile read
# (see taste/router.py), so existing users don't wait for their next vote.
SNAPSHOT_MODEL_VERSION = "genre-v2.2"
# Revisit once TV series (or other entity_scopes) get their own ratings
# and dimensions -- for now every snapshot is movie-scoped.
SNAPSHOT_ENTITY_SCOPE = "movie"
# Only genres above "average" (50) can name the archetype -- a genre that's
# merely the least-bad of a user's genres says nothing about them.
LABEL_MIN_SCORE = 50.0
# Confidence steps the profile counts down to ("8 more votes to 60%").
CONFIDENCE_STEP = 0.1


def _archetype_for(genre_slug: str) -> str:
    if genre_slug in ARCHETYPE_MAP:
        return ARCHETYPE_MAP[genre_slug]
    return f"طرفدار {genre_slug.replace('-', ' ').title()}"


def taste_signal_count(ratings: int, favorites: int, battles: int) -> float:
    """How much evidence the whole profile rests on: a battle vote is worth
    taste_battle_signal_weight of a rating, same as in genre preference."""
    return ratings + favorites + settings.taste_battle_signal_weight * battles


def snapshot_confidence(dimension_confidence_avg: float, signals: float) -> float:
    vote_shrinkage = signals / (signals + settings.taste_snapshot_confidence_k)
    return _clamp01(
        settings.taste_snapshot_dimension_weight * dimension_confidence_avg
        + settings.taste_snapshot_vote_weight * vote_shrinkage
    )


def label_genres(stats: list[GenreStat]) -> list[GenreStat]:
    """The 1-2 genres that name the user's archetype (already score-sorted)."""
    above = [s for s in stats if s.score > LABEL_MIN_SCORE]
    return (above or stats[:1])[: settings.taste_snapshot_label_dimension_count]


def confidence_hint(current: float, dimension_confidence_avg: float, signals: float) -> dict | None:
    """
    The next CONFIDENCE_STEP milestone and how many more ratings reach it,
    holding the per-genre confidence where it is -- so the count is an
    upper bound (each new rating also raises the genre confidences).
    None once the next step is out of reach of the vote half alone.
    """
    target = (math.floor(current / CONFIDENCE_STEP + 1e-9) + 1) * CONFIDENCE_STEP
    if target > 1.0:
        return None
    needed = 0
    while snapshot_confidence(dimension_confidence_avg, signals + needed) < target:
        needed += 1
        if needed > 500:
            return None
    return {"next_target": round(target, 2), "ratings_needed": max(1, needed)}


class TasteSnapshotComputer:
    """
    Rolls the top 1-2 above-average genres into a human-readable label +
    one overall model_confidence for the user's Taste DNA profile.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = TasteRepository(db)

    async def _signal_count(self, user_id: uuid.UUID) -> float:
        counts = select(
            select(func.count()).select_from(UserRating).where(UserRating.user_id == user_id).scalar_subquery(),
            select(func.count()).select_from(UserFavorite).where(UserFavorite.user_id == user_id).scalar_subquery(),
            select(func.count()).select_from(PairVote).where(
                PairVote.user_id == user_id, PairVote.winner != VoteOutcome.SKIP
            ).scalar_subquery(),
        )
        ratings, favorites, battles = (await self.db.execute(counts)).one()
        return taste_signal_count(ratings, favorites, battles)

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
        stats = await load_genre_stats(self.repo, user_id)
        if not stats:
            await self.repo.replace_snapshot(user_id, entity_scope, None)
            return False

        top = label_genres(stats)
        label = " + ".join(_archetype_for(s.dimension_key) for s in top)
        dimension_confidence_avg = sum(s.confidence for s in top) / len(top)
        model_confidence = snapshot_confidence(dimension_confidence_avg, await self._signal_count(user_id))

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


# --- taste insight (v2, rule-based) ---

PERSPECTIVE_SELF = "self"
PERSPECTIVE_OTHER = "other"

# Thresholds for each fact in build_insight to be worth a sentence.
INSIGHT_MIN_LIFT = 1.3
INSIGHT_MIN_LOVE = 0.6
INSIGHT_MAX_DISLIKE = 0.4
INSIGHT_LIKED_SCORE = 55.0


def _fa_number(value: float) -> str:
    text = f"{value:.1f}".rstrip("0").rstrip(".")
    return text.replace(".", "٫").translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def build_insight(stats: list[GenreStat], perspective: str = PERSPECTIVE_SELF) -> tuple[str, list[str]]:
    """
    A short Persian reading of the profile built from its actual numbers
    (lift, preference, breadth) -- no LLM. `perspective` picks the second-
    person sentences for the owner or the third-person ones for anyone
    viewing a public profile. Returns (text, archetype tags).
    """
    t = INSIGHT_SENTENCES[perspective]
    sentences: list[str] = []

    lifted = max((s for s in stats if s.lift is not None), key=lambda s: s.lift, default=None)
    loved = max((s for s in stats if s.affinity is not None), key=lambda s: s.affinity, default=None)
    disliked = min((s for s in stats if s.affinity is not None), key=lambda s: s.affinity, default=None)

    lift_used = lifted is not None and lifted.lift >= INSIGHT_MIN_LIFT
    love_used = loved is not None and loved.affinity >= INSIGHT_MIN_LOVE
    if lift_used:
        times = _fa_number(lifted.lift)
        if love_used and loved.dimension_key == lifted.dimension_key:
            sentences.append(t["lift_and_love"].format(genre=genre_fa(lifted.dimension_key), times=times))
            love_used = False
        else:
            sentences.append(t["lift"].format(genre=genre_fa(lifted.dimension_key), times=times))
    if love_used:
        sentences.append(t["love"].format(genre=genre_fa(loved.dimension_key)))
    if disliked is not None and disliked.affinity <= INSIGHT_MAX_DISLIKE and (
        loved is None or disliked.dimension_key != loved.dimension_key
    ):
        sentences.append(t["dislike"].format(genre=genre_fa(disliked.dimension_key)))

    liked_count = sum(1 for s in stats if s.score >= INSIGHT_LIKED_SCORE)
    if len(sentences) < 3:
        if liked_count >= 4:
            sentences.append(t["broad"])
        elif liked_count == 1 and len(stats) >= 3:
            sentences.append(t["focused"])

    if not sentences:
        sentences.append(t["unclear"])

    tags = [_archetype_for(s.dimension_key) for s in stats[:3]]
    return " ".join(sentences), tags


class TasteInsightComputer:
    """
    Persists the owner's (second-person) reading from build_insight. Public
    profiles rebuild the third-person one at read time from the same
    dimensions (TasteService), so the stored text is never shown to
    someone else as if addressed to them.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = TasteRepository(db)

    async def compute_insight(self, user_id: uuid.UUID) -> bool:
        """
        Recomputes the user's single current insight row from their
        already-persisted genre rows -- expects compute_genre_dimensions to
        have run first in the same call chain. Flushes but does NOT commit.

        Returns whether an insight was written; False means the user has
        no qualifying dimensions yet and any prior insight was cleared.
        """
        stats = await load_genre_stats(self.repo, user_id)
        if not stats:
            await self.repo.replace_insight(user_id, None)
            return False

        text, tags = build_insight(stats, PERSPECTIVE_SELF)
        await self.repo.replace_insight(user_id, {"insight_text": text, "insight_tags": tags})
        return True


# --- taste facets: people, decades, countries ---

FACET_DIRECTOR = "director"
FACET_ACTOR = "actor"
FACET_DECADE = "decade"
FACET_COUNTRY = "country"
FACET_TYPES = (FACET_DIRECTOR, FACET_ACTOR, FACET_DECADE, FACET_COUNTRY)

# Liked titles needed before any facet is shown -- below this a "favorite
# decade" is just whatever the first two ratings happened to be.
FACET_MIN_TITLES = 5
# A person needs this many liked titles to count as a taste, not a fluke.
PERSON_MIN_TITLES = 2
PERSON_LIMIT = 6
# Only top-billed cast (acted_in edge_metadata.order below this) counts.
ACTOR_MAX_BILLING = 5
SHARE_LIMIT = 6
# A liked title's weight from a battle win, relative to a ♥ (1.0).
BATTLE_WIN_FACET_WEIGHT = 0.5
# A rated title counts as liked from this preference component up -- i.e.
# rated at or above the user's own average.
LIKED_MIN_WEIGHT = 0.5


class TasteFacetComputer:
    """
    Who and what sits behind the titles a user likes: favorite directors
    and lead actors (from directed_by / acted_in edges), and the decades
    and countries those titles come from. A liked title is one rated at or
    above the user's own average (weighted by how far above), a ♥, or a
    battle winner; each facet value scores the summed weight of its titles.

    Stored as plain dimension rows: director/actor keys are the person's
    entity id (resolved to name/slug/photo at read time), decade keys the
    decade's first year ("1990"), country keys an ISO 3166-1 code.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = TasteRepository(db)

    async def _liked_title_weights(self, user_id: uuid.UUID) -> dict[uuid.UUID, float]:
        weights: dict[uuid.UUID, float] = {}
        ratings = (
            await self.db.execute(
                select(UserRating.entity_id, UserRating.score).where(UserRating.user_id == user_id)
            )
        ).all()
        if ratings:
            user_avg = sum(score for _, score in ratings) / len(ratings)
            for entity_id, score in ratings:
                weight = _clamp01(0.5 + (score - user_avg) / AFFINITY_SPAN_STARS)
                if weight >= LIKED_MIN_WEIGHT:
                    weights[entity_id] = weight
        rated = {entity_id for entity_id, _ in ratings}

        favorites = await self.db.execute(select(UserFavorite.entity_id).where(UserFavorite.user_id == user_id))
        for (entity_id,) in favorites.all():
            if entity_id not in rated:
                weights[entity_id] = 1.0

        won = case((PairVote.winner == VoteOutcome.LEFT, PairVote.left_item), else_=PairVote.right_item)
        wins = await self.db.execute(
            select(won).where(PairVote.user_id == user_id, PairVote.winner != VoteOutcome.SKIP)
        )
        for (entity_id,) in wins.all():
            if entity_id not in rated:
                weights[entity_id] = min(1.0, weights.get(entity_id, 0.0) + BATTLE_WIN_FACET_WEIGHT)
        return weights

    async def _people_rows(self, weights: dict[uuid.UUID, float], relation_type: str) -> list[dict]:
        stmt = select(RelationshipEdge.from_entity_id, RelationshipEdge.to_entity_id).where(
            RelationshipEdge.from_entity_id.in_(list(weights)),
            RelationshipEdge.relation_type == relation_type,
        )
        if relation_type == "acted_in":
            stmt = stmt.where(RelationshipEdge.edge_metadata["order"].as_integer() < ACTOR_MAX_BILLING)
        totals: dict[uuid.UUID, float] = {}
        counts: dict[uuid.UUID, int] = {}
        for title_id, person_id in (await self.db.execute(stmt)).all():
            totals[person_id] = totals.get(person_id, 0.0) + weights[title_id]
            counts[person_id] = counts.get(person_id, 0) + 1
        ranked = sorted(
            (p for p in totals if counts[p] >= PERSON_MIN_TITLES),
            key=lambda p: (-totals[p], -counts[p], str(p)),
        )[:PERSON_LIMIT]
        if not ranked:
            return []
        top = totals[ranked[0]]
        return [
            {
                "dimension_key": str(p),
                "score": round(100 * totals[p] / top, 1),
                "confidence": counts[p] / (counts[p] + PERSON_MIN_TITLES),
                "sample_size": counts[p],
            }
            for p in ranked
        ]

    @staticmethod
    def _share_rows(values: list[tuple[str, float]]) -> list[dict]:
        """values: one (facet key, title weight) per liked title with that facet."""
        totals: dict[str, float] = {}
        counts: dict[str, int] = {}
        for key, weight in values:
            totals[key] = totals.get(key, 0.0) + weight
            counts[key] = counts.get(key, 0) + 1
        grand_total = sum(totals.values())
        if grand_total <= 0:
            return []
        ranked = sorted(totals, key=lambda k: (-totals[k], k))[:SHARE_LIMIT]
        return [
            {
                "dimension_key": k,
                "score": round(100 * totals[k] / grand_total, 1),
                "confidence": counts[k] / (counts[k] + PERSON_MIN_TITLES),
                "sample_size": counts[k],
            }
            for k in ranked
        ]

    async def compute_facets(self, user_id: uuid.UUID) -> int:
        """Flushes but does NOT commit, same as the other compute_* methods.
        Returns the number of facet rows persisted."""
        weights = await self._liked_title_weights(user_id)
        rows_by_type: dict[str, list[dict]] = {t: [] for t in FACET_TYPES}

        if len(weights) >= FACET_MIN_TITLES:
            rows_by_type[FACET_DIRECTOR] = await self._people_rows(weights, "directed_by")
            rows_by_type[FACET_ACTOR] = await self._people_rows(weights, "acted_in")
            attrs = await self.db.execute(
                select(Entity.id, Entity.attributes["year"].as_integer(), Entity.attributes["country"].as_string()).where(
                    Entity.id.in_(list(weights))
                )
            )
            decades, countries = [], []
            for entity_id, year, country in attrs.all():
                if year and year > 1000:
                    decades.append((str(year // 10 * 10), weights[entity_id]))
                if country and len(country) == 2:
                    countries.append((country.upper(), weights[entity_id]))
            rows_by_type[FACET_DECADE] = self._share_rows(decades)
            rows_by_type[FACET_COUNTRY] = self._share_rows(countries)

        for dimension_type, rows in rows_by_type.items():
            await self.repo.bulk_upsert_dimensions(user_id, dimension_type, rows)
        return sum(len(rows) for rows in rows_by_type.values())


class ContributionStatsComputer:
    """
    Fills user_contribution_stats, the one Taste DNA table that had a
    model/schema/frontend card but no writer anywhere in the app --
    user_contribution_stats always had 0 rows until this. Unlike the
    other computers here, there's no "qualifying dimensions" empty state:
    a fresh user just gets a row of zeros, which is still meaningful to
    show (an honest "0" earns its place, unlike showing nothing).

    relationships_discovered was dropped from the schema entirely rather
    than computed: there's no feature anywhere in the product where a
    user submits or discovers a graph relationship (edges only ever come
    from TMDb sync), so it had no signal to read from.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = TasteRepository(db)

    async def compute_contribution_stats(self, user_id: uuid.UUID) -> None:
        # All four counts in one round trip (this runs on every rating,
        # battle vote, comment and favorite toggle).
        counts = select(
            select(func.count()).select_from(UserRating).where(
                UserRating.user_id == user_id
            ).scalar_subquery(),
            # Skips are shown to the user but aren't a comparison they actually
            # made a call on, so they don't count as a contribution.
            select(func.count()).select_from(PairVote).where(
                PairVote.user_id == user_id,
                PairVote.winner != VoteOutcome.SKIP,
            ).scalar_subquery(),
            select(func.count()).select_from(ListComment).where(
                ListComment.user_id == user_id
            ).scalar_subquery(),
            select(func.count()).select_from(UserFavorite).where(
                UserFavorite.user_id == user_id
            ).scalar_subquery(),
        )
        votes_count, battles_count, comments_count, favorites_count = (await self.db.execute(counts)).one()

        contribution_score = (
            votes_count * settings.taste_contribution_vote_weight
            + battles_count * settings.taste_contribution_battle_weight
            + comments_count * settings.taste_contribution_comment_weight
            + favorites_count * settings.taste_contribution_favorite_weight
        )

        await self.repo.replace_contribution_stats(
            user_id,
            {
                "votes_count": votes_count,
                "battles_count": battles_count,
                "comments_count": comments_count,
                "favorites_count": favorites_count,
                "contribution_score": contribution_score,
            },
        )
