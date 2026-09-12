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
    score: float
    confidence: float
    sample_size: int
    updated_at: datetime


class TasteAnchorEntity(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    entity_type: str
    poster_path: str | None = None


class TasteAnchorPublic(BaseModel):
    entity: TasteAnchorEntity
    anchor_strength: str
    match_score: float
    rank: int


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
    relationships_discovered: int
    contribution_score: float
    updated_at: datetime


class TasteProfile(BaseModel):
    snapshot: TasteSnapshotPublic | None = None
    dimensions: list[TasteDimensionPublic] = []
    anchors: list[TasteAnchorPublic] = []
    # user_taste_insights is single-row-per-user (see TasteRepository.replace_insight's
    # docstring -- same delete-then-insert contract as replace_snapshot), so this
    # mirrors snapshot/contribution_stats as a nullable single object, not a list.
    insight: TasteInsightPublic | None = None
    contribution_stats: ContributionStatsPublic | None = None
