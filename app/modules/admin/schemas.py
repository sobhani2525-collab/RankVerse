import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, ConfigDict, Field


class AdminLogin(BaseModel):
    email: EmailStr
    password: str


class AdminPasswordChange(BaseModel):
    current_password: str
    # NIST 800-63B: length matters more than composition rules, so this is
    # the only client-independent constraint enforced here.
    new_password: str = Field(min_length=12)


class AdminPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: str
    role: str
    last_login_at: datetime | None = None


class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin: AdminPublic


class AdminListRow(BaseModel):
    id: uuid.UUID
    title: str
    slug: str
    owner_username: str | None
    entity_type: str | None
    visibility: str
    item_count: int
    like_count: int
    comment_count: int
    created_at: datetime
    is_featured: bool
    featured_order: int | None
    is_hidden_from_discovery: bool
    curation_note: str | None


class AdminListUpdate(BaseModel):
    is_featured: bool | None = None
    featured_order: int | None = None
    is_hidden_from_discovery: bool | None = None
    curation_note: str | None = Field(default=None, max_length=500)


class AdminFeaturedReorder(BaseModel):
    ids: list[uuid.UUID]
