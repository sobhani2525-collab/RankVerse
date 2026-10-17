import uuid
from datetime import datetime

from pydantic import BaseModel

NOTIFICATION_TYPES = ("list_liked", "list_commented", "comment_replied", "list_followed", "list_featured")


class NotificationPublic(BaseModel):
    id: uuid.UUID
    type: str
    message: str
    link: str | None
    actor_count: int
    is_read: bool
    created_at: datetime


class NotificationPage(BaseModel):
    items: list[NotificationPublic]
    next_cursor: str | None


class PreferencesUpdate(BaseModel):
    preferences: dict[str, bool]
