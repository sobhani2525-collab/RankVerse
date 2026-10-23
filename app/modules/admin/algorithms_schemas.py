import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AlgorithmParam(BaseModel):
    group: str  # ranking | elo | taste | lists | daily_battle
    key: str
    env: str | None  # env var that sets it; None for a code constant
    value: float | int | str


class RankingTypeHealth(BaseModel):
    entity_type: str
    total: int
    ranked: int
    with_user_votes: int
    with_battles: int
    histogram: list[int]  # computed_score per 1-point bucket, 0-1 .. 9-10
    last_recompute_at: datetime | None = None
    oldest_recompute_at: datetime | None = None


class TasteHealth(BaseModel):
    users_with_snapshot: int
    avg_confidence: float | None = None
    computed_7d: int
    last_computed_at: datetime | None = None
    contribution_rows: int


class AlgorithmsHealth(BaseModel):
    types: list[RankingTypeHealth]
    ratings_total: int
    platform_avg: float | None = None  # C, 1-5
    elo_entities: int
    elo_max: float | None = None
    elo_min: float | None = None
    taste: TasteHealth
    generated_at: datetime


class ScoreBreakdownOut(BaseModel):
    platform_avg: float
    user_avg: float | None
    user_votes: int
    bayesian: float
    external_source: str
    external_rating: float | None
    external_votes: int
    external: float
    user_weight: float
    blended: float
    elo: float | None
    matches: int
    battle_adjustment: float
    final: float


class TitleRef(BaseModel):
    id: uuid.UUID
    entity_type: str
    title: str
    title_fa: str | None = None
    slug: str
    year: int | None = None


class ScoreExplanation(BaseModel):
    title: TitleRef
    stored_score: float | None
    stored_at: datetime | None
    breakdown: ScoreBreakdownOut


class DriftRow(BaseModel):
    title: TitleRef
    stored_score: float | None
    current_score: float


class DriftReport(BaseModel):
    checked: int
    drifted: int
    rows: list[DriftRow]  # biggest difference first
    drifted_ids: list[uuid.UUID]


class RecomputeRequest(BaseModel):
    entity_ids: list[uuid.UUID] = Field(min_length=1, max_length=300)


class RecomputeResult(BaseModel):
    recomputed: int
