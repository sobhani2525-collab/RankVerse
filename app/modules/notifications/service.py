import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import AsyncSessionLocal
from app.core.exceptions import NotFoundError, ValidationError
from app.modules.notifications.models import Notification
from app.modules.notifications.repository import NotificationRepository, encode_cursor
from app.modules.notifications.schemas import (
    NOTIFICATION_TYPES,
    NotificationPage,
    NotificationPublic,
)
from app.modules.users.models import User

logger = logging.getLogger(__name__)

_ACTOR_IDS_CAP = 200  # remembered per aggregated row so one person never counts twice
_PERSIAN_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
_background: set[asyncio.Task] = set()


def fa_number(n: int) -> str:
    return str(n).translate(_PERSIAN_DIGITS)


def render_message(n: Notification) -> str:
    p = n.payload or {}
    actor = p.get("actor_name") or "کاربری"
    title = p.get("list_title") or "شما"
    others = max(n.actor_count - 1, 0)
    who = f"{actor} و {fa_number(others)} نفر دیگر" if others else actor
    plural = "ند" if others else ""
    snippet = p.get("snippet", "")
    if n.type == "list_liked":
        return f"{who} لیست «{title}» شما را پسندید{plural}"
    if n.type == "list_followed":
        return f"{who} لیست «{title}» شما را دنبال کرد{plural}"
    if n.type == "list_commented":
        return f"{actor} روی لیست «{title}» نظر گذاشت: {snippet}".rstrip(": ")
    if n.type == "comment_replied":
        return f"{actor} به نظر شما در لیست «{title}» پاسخ داد: {snippet}".rstrip(": ")
    if n.type == "list_featured":
        return f"لیست «{title}» شما در لیست‌های ویژهٔ صفحه اصلی انتخاب شد"
    return "اعلان جدید"


def render_link(n: Notification) -> str | None:
    slug = (n.payload or {}).get("list_slug")
    if not slug:
        return None
    return f"/lists/{slug}#comments" if n.type in ("list_commented", "comment_replied") else f"/lists/{slug}"


def to_public(n: Notification) -> NotificationPublic:
    return NotificationPublic(
        id=n.id,
        type=n.type,
        message=render_message(n),
        link=render_link(n),
        actor_count=n.actor_count,
        is_read=n.is_read,
        created_at=n.created_at,
    )


async def notify_later(**kwargs) -> None:
    """Fire-and-forget on its own session, after the main action has committed.
    Never raises: a failed notification must not fail the like/comment/follow."""
    try:
        task = asyncio.get_running_loop().create_task(_deliver(kwargs))
        _background.add(task)
        task.add_done_callback(_background.discard)
    except Exception:
        logger.exception("could not schedule notification %s", kwargs.get("type"))


async def _deliver(kwargs: dict) -> None:
    try:
        async with AsyncSessionLocal() as db:
            await NotificationService(db).notify(**kwargs)
            await db.commit()
    except Exception:
        logger.exception("notification delivery failed (%s)", kwargs.get("type"))


class NotificationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = NotificationRepository(db)

    async def notify(
        self,
        *,
        recipient_id: uuid.UUID,
        actor_id: uuid.UUID | None,
        type: str,
        target_type: str,
        target_id: uuid.UUID,
        payload: dict,
        aggregate: bool = False,
    ) -> Notification | None:
        """Create (or fold into an unread aggregate) one notification.
        Returns None when skipped: own action, preference off, or cooldown."""
        if type not in NOTIFICATION_TYPES:
            raise ValidationError(f"Unknown notification type '{type}'")
        if actor_id is not None and actor_id == recipient_id:
            return None
        if type in await self.repo.disabled_types(recipient_id):
            return None

        payload = dict(payload)
        if actor_id is not None:
            actor = await self.db.get(User, actor_id)
            payload["actor_name"] = actor.username if actor else None
        key = f"{type}:{target_id}" if aggregate else None

        if key and actor_id is not None:
            since = datetime.now(timezone.utc) - timedelta(seconds=settings.notif_like_cooldown_seconds)
            if await self.repo.recent_by_actor(recipient_id, key, actor_id, since):
                return None  # like/unlike/like churn inside the cooldown

        if key:
            existing = await self.repo.unread_by_key(recipient_id, key)
            if existing is not None:
                return self._fold(existing, actor_id, payload)

        row = Notification(
            recipient_id=recipient_id,
            actor_id=actor_id,
            type=type,
            target_type=target_type,
            target_id=target_id,
            payload={**payload, "actor_ids": [str(actor_id)] if actor_id else []},
            aggregate_key=key,
            actor_count=1,
        )
        try:
            async with self.db.begin_nested():
                await self.repo.add(row)
        except Exception:
            # Lost the race for the unique unread-aggregate slot: fold instead.
            existing = await self.repo.unread_by_key(recipient_id, key) if key else None
            if existing is None:
                raise
            return self._fold(existing, actor_id, payload)
        return row

    @staticmethod
    def _fold(existing: Notification, actor_id: uuid.UUID | None, payload: dict) -> Notification | None:
        ids = list((existing.payload or {}).get("actor_ids", []))
        if actor_id is not None and str(actor_id) in ids:
            return None  # same person again (e.g. unlike then like after the cooldown)
        if actor_id is not None and len(ids) < _ACTOR_IDS_CAP:
            ids.append(str(actor_id))
        existing.payload = {**existing.payload, "actor_name": payload.get("actor_name"), "actor_ids": ids}
        existing.actor_id = actor_id
        existing.actor_count = existing.actor_count + 1
        existing.created_at = datetime.now(timezone.utc)  # bubbles to the top of the feed
        return existing

    # --- reading / managing (recipient_id always comes from auth, never the client) ---

    async def list(self, user_id: uuid.UUID, cursor: str | None, limit: int | None) -> NotificationPage:
        limit = min(max(limit or settings.notif_page_size, 1), settings.notif_page_size_max)
        rows = await self.repo.page(user_id, cursor, limit)
        more = len(rows) > limit
        rows = rows[:limit]
        next_cursor = encode_cursor(rows[-1].created_at, rows[-1].id) if more and rows else None
        return NotificationPage(items=[to_public(r) for r in rows], next_cursor=next_cursor)

    async def unread_count(self, user_id: uuid.UUID) -> int:
        return await self.repo.unread_count(user_id)

    async def mark_read(self, user_id: uuid.UUID, nid: uuid.UUID) -> None:
        if not await self.repo.mark_read(user_id, nid):
            raise NotFoundError("Notification not found")
        await self.db.commit()

    async def mark_all_read(self, user_id: uuid.UUID) -> int:
        n = await self.repo.mark_all_read(user_id)
        await self.db.commit()
        return n

    async def delete(self, user_id: uuid.UUID, nid: uuid.UUID) -> None:
        if not await self.repo.delete(user_id, nid):
            raise NotFoundError("Notification not found")
        await self.db.commit()

    async def get_preferences(self, user_id: uuid.UUID) -> dict[str, bool]:
        stored = await self.repo.preferences(user_id)
        return {t: stored.get(t, True) for t in NOTIFICATION_TYPES}

    async def update_preferences(self, user_id: uuid.UUID, prefs: dict[str, bool]) -> dict[str, bool]:
        unknown = set(prefs) - set(NOTIFICATION_TYPES)
        if unknown:
            raise ValidationError(f"Unknown notification types: {', '.join(sorted(unknown))}")
        for t, enabled in prefs.items():
            await self.repo.set_preference(user_id, t, enabled)
        await self.db.commit()
        return await self.get_preferences(user_id)

    async def cleanup(self) -> int:
        n = await self.repo.purge_read_older_than(settings.notif_retention_days)
        await self.db.commit()
        return n
