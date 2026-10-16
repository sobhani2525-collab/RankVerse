import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class WatchLinkPublic(BaseModel):
    """What the title page needs. The URL is deliberately absent: visitors go
    through /watch-links/{id}/go so every click is counted."""
    id: uuid.UUID
    provider: str
    provider_name: str
    access_type: str
    access_label: str
    is_affiliate: bool = False


class WatchLinkUpsert(BaseModel):
    entity_id: uuid.UUID
    provider: str = Field(max_length=30)
    url: str = Field(max_length=1000)
    access_type: str = Field(default="subscription", max_length=20)
    is_affiliate: bool = False


class WatchLinkImportRow(BaseModel):
    entity_slug: str = Field(max_length=300)
    provider: str = Field(max_length=30)
    url: str = Field(max_length=1000)
    access_type: str = Field(default="subscription", max_length=20)
    is_affiliate: bool = False


class WatchLinkImport(BaseModel):
    rows: list[WatchLinkImportRow] = Field(min_length=1, max_length=500)


class WatchLinkImportResult(BaseModel):
    row: int  # 1-based position in the submitted list
    entity_slug: str
    ok: bool
    error: str | None = None


class WatchLinkAdmin(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    entity_type: str
    entity_title: str
    entity_title_fa: str | None = None
    entity_slug: str
    provider: str
    provider_name: str
    url: str
    access_type: str
    is_affiliate: bool
    source: str
    click_count: int
    updated_at: datetime | None = None


class WatchEntityHit(BaseModel):
    id: uuid.UUID
    entity_type: str
    title: str
    title_fa: str | None = None
    slug: str
    year: int | None = None
    link_count: int = 0
