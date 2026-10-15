import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


def _strip(value: str | None) -> str | None:
    return value.strip() if isinstance(value, str) else value


class AdminUserRow(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    display_name: str | None = None
    avatar_key: str | None = None
    status: str  # active | blocked | deleted
    email_verified: bool
    created_at: datetime
    last_login_at: datetime | None = None
    ratings_count: int = 0
    lists_count: int = 0
    comments_count: int = 0


class AdminUserDetail(AdminUserRow):
    bio: str | None = None
    admin_note: str | None = None
    email_verified_at: datetime | None = None
    favorites_count: int = 0
    battle_votes_count: int = 0
    blocked_at: datetime | None = None
    blocked_reason: str | None = None
    blocked_by_admin_id: uuid.UUID | None = None
    blocked_by_admin_email: str | None = None
    deleted_at: datetime | None = None


class AdminUserUpdate(BaseModel):
    """Only fields the admin actually sent are touched (see model_fields_set)."""

    display_name: str | None = Field(None, max_length=50)
    bio: str | None = Field(None, max_length=300)
    email: EmailStr | None = None
    username: str | None = Field(None, min_length=3, max_length=50)
    admin_note: str | None = Field(None, max_length=5000)

    _strip_fields = field_validator("display_name", "bio", "username", "admin_note")(_strip)


class AdminUserBlock(BaseModel):
    reason: str = Field(min_length=1, max_length=300)

    _strip_reason = field_validator("reason")(_strip)

    @field_validator("reason")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v:
            raise ValueError("reason is required")
        return v


class AdminUserStats(BaseModel):
    total: int
    new_7d: int
    new_7d_change_pct: float | None = None
    new_30d: int
    new_30d_change_pct: float | None = None
    active_today: int
    blocked: int
    unverified: int
    deleted: int


class AdminAuditLogRow(BaseModel):
    id: uuid.UUID
    admin_id: uuid.UUID | None = None
    admin_email: str
    action: str
    target_type: str
    target_id: str
    before: dict | None = None
    after: dict | None = None
    ip: str | None = None
    user_agent: str | None = None
    created_at: datetime
