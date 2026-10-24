import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TasteSnapshotPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True, protected_namespaces=())
    label: str
    model_confidence: float
    entity_scope: str
    computed_at: datetime
    model_version: str


class TasteDimensionPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    dimension_type: str
    dimension_key: str
    # 0-100, 50 = average (see TasteDimensionComputer).
    score: float
    confidence: float
    sample_size: int
    updated_at: datetime | None = None
    # The score's two halves (genre-v2 profiles; None before a recompute):
    # preference 0-1 with 0.5 = neutral, and how many times the platform's
    # base rate the user chooses this genre.
    affinity: float | None = None
    lift: float | None = None


class TasteAnchorEntity(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    entity_type: str
    poster_path: str | None = None
    # Persian title when TMDb has one (see sync/normalizer._persian_title);
    # the frontend's displayTitle() composes "title_fa (title)" from it,
    # same as EntityMini elsewhere.
    title_fa: str | None = None


class TasteAnchorPublic(BaseModel):
    entity: TasteAnchorEntity
    anchor_strength: str
    match_score: float
    rank: int
    # The user's own 1-5 rating of it (anchors are picked from high ratings).
    user_rating: int | None = None


class PredictedPickPublic(BaseModel):
    # Reuses TasteAnchorEntity's shape (id/slug/title/entity_type/poster_path)
    # -- same fields TastePredictedPicksCard needs as TasteAnchorsCard's row.
    entity: TasteAnchorEntity
    match_score: float
    # Liked genre slugs this title has, strongest first (the card's "why").
    reason_genres: list[str] = []
    year: int | None = None


class TasteInsightPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    insight_text: str
    insight_tags: list[str] = []
    generated_at: datetime


class ContributionStatsPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    votes_count: int
    battles_count: int
    comments_count: int
    favorites_count: int
    contribution_score: float
    updated_at: datetime


class TastePersonEntity(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    title_fa: str | None = None
    profile_path: str | None = None


class TastePersonPublic(BaseModel):
    entity: TastePersonEntity
    # 0-100 relative to the user's top person in the same role.
    score: float
    # Liked titles behind it.
    sample_size: int


class TasteSharePublic(BaseModel):
    # Decade's first year ("1990") or ISO 3166-1 country code.
    key: str
    # Percent of the user's liked-title weight.
    share: float
    sample_size: int


class TasteFacets(BaseModel):
    directors: list[TastePersonPublic] = []
    actors: list[TastePersonPublic] = []
    decades: list[TasteSharePublic] = []
    countries: list[TasteSharePublic] = []


class RatingStylePublic(BaseModel):
    ratings_count: int
    user_avg: float
    platform_avg: float | None = None


class ConfidenceHintPublic(BaseModel):
    # Next model_confidence milestone (0-1) and how many more ratings reach
    # it at most (see compute.confidence_hint).
    next_target: float
    ratings_needed: int


class TasteProfile(BaseModel):
    snapshot: TasteSnapshotPublic | None = None
    dimensions: list[TasteDimensionPublic] = []
    anchors: list[TasteAnchorPublic] = []
    # user_taste_insights is single-row-per-user (see TasteRepository.replace_insight's
    # docstring -- same delete-then-insert contract as replace_snapshot), so this
    # mirrors snapshot/contribution_stats as a nullable single object, not a list.
    insight: TasteInsightPublic | None = None
    contribution_stats: ContributionStatsPublic | None = None
    facets: TasteFacets = TasteFacets()
    rating_style: RatingStylePublic | None = None
    confidence_hint: ConfidenceHintPublic | None = None
