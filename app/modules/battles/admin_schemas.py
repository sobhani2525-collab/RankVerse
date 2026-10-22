import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AdminBattleRow(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    creator_username: str | None
    entity_type: str
    mode: str
    bracket_size: int
    status: str
    visibility: str
    is_official: bool
    is_featured: bool
    featured_order: int | None
    is_hidden_from_discovery: bool
    curation_note: str | None
    players_count: int
    follower_count: int
    created_at: datetime


class AdminBattleUpdate(BaseModel):
    is_featured: bool | None = None
    featured_order: int | None = None
    is_hidden_from_discovery: bool | None = None
    is_official: bool | None = None
    curation_note: str | None = Field(default=None, max_length=500)


class AdminBattleFeaturedReorder(BaseModel):
    ids: list[uuid.UUID]
