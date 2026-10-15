import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


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


class AdminUserFilter(BaseModel):
    """The list endpoint's filters, as a body (bulk "select all matching")."""

    q: str | None = Field(None, max_length=200)
    status: Literal["active", "blocked", "deleted", "all"] | None = None
    email_verified: bool | None = None
    created_from: datetime | None = None
    created_to: datetime | None = None
    last_login_from: datetime | None = None
    last_login_to: datetime | None = None
    never_logged_in: bool | None = None


class AdminUserBulk(BaseModel):
    action: Literal["block", "unblock", "delete", "restore", "verify_email"]
    ids: list[uuid.UUID] | None = Field(None, min_length=1, max_length=500)
    filter: AdminUserFilter | None = None
    reason: str | None = Field(None, max_length=300)

    @field_validator("reason")
    @classmethod
    def _strip_reason(cls, v: str | None) -> str | None:
        return (v or "").strip() or None

    @model_validator(mode="after")
    def _check(self):
        if (self.ids is None) == (self.filter is None):
            raise ValueError("send exactly one of ids or filter")
        if self.action == "block" and not self.reason:
            raise ValueError("reason is required to block")
        return self


class AdminUserBulkFailure(BaseModel):
    id: uuid.UUID
    reason: str


class AdminUserBulkResult(BaseModel):
    succeeded: list[uuid.UUID] = []
    failed: list[AdminUserBulkFailure] = []
    skipped: list[uuid.UUID] = []
