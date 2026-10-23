import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class IngestionSources(BaseModel):
    tmdb_configured: bool
    tmdb_base_url: str
    # Machine translation of overviews/biographies (scripts/translate_*.py)
    translation_configured: bool
    translation_model: str


class IngestionTypeStats(BaseModel):
    entity_type: str
    total: int
    added_7d: int
    added_30d: int
    changed_7d: int  # updated_at: a TMDb re-sync, but also IMDb ratings, translations, admin edits
    unchanged_180d: int
    last_added_at: datetime | None = None
    last_changed_at: datetime | None = None
    sources: dict[str, int]  # external_source -> count ("none" when null)


class IngestionTitleCoverage(BaseModel):
    entity_type: str
    total: int
    with_imdb_id: int
    with_imdb_rating: int
    # overview_source -> count: tmdb_fa | machine | manual | en | none
    overview_sources: dict[str, int]


class IngestionTitle(BaseModel):
    id: uuid.UUID
    entity_type: str
    title: str
    title_fa: str | None = None
    slug: str
    tmdb_id: str | None = None
    vote_count: int | None = None
    created_at: datetime
    updated_at: datetime


class IngestionRun(BaseModel):
    created_at: datetime
    admin_email: str
    action: str
    target_id: str
    after: dict | None = None


class IngestionAlerts(BaseModel):
    open: int
    last_title: str | None = None
    last_seen_at: datetime | None = None


class AdminIngestionOverview(BaseModel):
    sources: IngestionSources
    types: list[IngestionTypeStats]  # movie, tv_series, person, genre
    coverage: list[IngestionTitleCoverage]  # movie, tv_series
    biography_sources: dict[str, int]  # people: tmdb_fa | machine | en | none
    recent: list[IngestionTitle]  # last movies/series added
    stale: list[IngestionTitle]  # well-known titles untouched the longest: first to re-sync
    runs: list[IngestionRun]  # syncs started from this panel
    sync_alerts: IngestionAlerts
    generated_at: datetime


class TmdbCheck(BaseModel):
    ok: bool
    status: int | None = None
    ms: int
    message: str


class IngestionSyncRequest(BaseModel):
    entity_type: Literal["movie", "tv_series"]
    tmdb_id: int = Field(ge=1, le=99_999_999)


class IngestionSyncResult(BaseModel):
    id: uuid.UUID
    entity_type: str
    title: str
    slug: str
    created: bool  # false: an existing title was refreshed
