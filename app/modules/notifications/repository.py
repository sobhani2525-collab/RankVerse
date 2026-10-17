import base64
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notifications.models import Notification, NotificationPreference


def encode_cursor(created_at: datetime, nid: uuid.UUID) -> str:
    return base64.urlsafe_b64encode(f"{created_at.isoformat()}|{nid}".encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID] | None:
    try:
        ts, nid = base64.urlsafe_b64decode(cursor.encode()).decode().split("|")
        return datetime.fromisoformat(ts), uuid.UUID(nid)
    except Exception:
        return None


class NotificationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def disabled_types(self, user_id: uuid.UUID) -> set[str]:
        rows = await self.db.execute(
            select(NotificationPreference.type).where(
                NotificationPreference.user_id == user_id, NotificationPreference.enabled.is_(False)
            )
        )
        return set(rows.scalars())

    async def preferences(self, user_id: uuid.UUID) -> dict[str, bool]:
        rows = await self.db.execute(
            select(NotificationPreference.type, NotificationPreference.enabled).where(
                NotificationPreference.user_id == user_id
            )
        )
        return {t: e for t, e in rows.all()}

    async def set_preference(self, user_id: uuid.UUID, ntype: str, enabled: bool) -> None:
        row = (
            await self.db.execute(
                select(NotificationPreference).where(
                    NotificationPreference.user_id == user_id, NotificationPreference.type == ntype
                )
            )
        ).scalar_one_or_none()
        if row is None:
            self.db.add(NotificationPreference(user_id=user_id, type=ntype, enabled=enabled))
        else:
            row.enabled = enabled

    async def recent_by_actor(
        self, recipient_id: uuid.UUID, aggregate_key: str, actor_id: uuid.UUID, since: datetime
    ) -> bool:
        stmt = (
            select(Notification.id)
            .where(
                Notification.recipient_id == recipient_id,
                Notification.aggregate_key == aggregate_key,
                Notification.actor_id == actor_id,
                Notification.updated_at >= since,
            )
            .limit(1)
        )
        return (await self.db.execute(stmt)).first() is not None

    async def unread_by_key(self, recipient_id: uuid.UUID, aggregate_key: str, lock: bool = True) -> Notification | None:
        stmt = select(Notification).where(
            Notification.recipient_id == recipient_id,
            Notification.aggregate_key == aggregate_key,
            Notification.is_read.is_(False),
        )
        if lock:
            stmt = stmt.with_for_update()
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def add(self, notification: Notification) -> None:
        self.db.add(notification)
        await self.db.flush()

    async def page(self, recipient_id: uuid.UUID, cursor: str | None, limit: int) -> list[Notification]:
        stmt = select(Notification).where(Notification.recipient_id == recipient_id)
        decoded = decode_cursor(cursor) if cursor else None
        if decoded:
            ts, nid = decoded
            stmt = stmt.where(
                (Notification.created_at < ts) | ((Notification.created_at == ts) & (Notification.id < nid))
            )
        stmt = stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit + 1)
        return list((await self.db.execute(stmt)).scalars())

    async def unread_count(self, recipient_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(Notification).where(
            Notification.recipient_id == recipient_id, Notification.is_read.is_(False)
        )
        return (await self.db.execute(stmt)).scalar_one()

    async def mark_read(self, recipient_id: uuid.UUID, nid: uuid.UUID) -> bool:
        result = await self.db.execute(
            update(Notification)
            .where(Notification.id == nid, Notification.recipient_id == recipient_id)
            .values(is_read=True, read_at=func.coalesce(Notification.read_at, func.now()))
        )
        return result.rowcount > 0

    async def mark_all_read(self, recipient_id: uuid.UUID) -> int:
        result = await self.db.execute(
            update(Notification)
            .where(Notification.recipient_id == recipient_id, Notification.is_read.is_(False))
            .values(is_read=True, read_at=func.now())
        )
        return result.rowcount

    async def delete(self, recipient_id: uuid.UUID, nid: uuid.UUID) -> bool:
        result = await self.db.execute(
            delete(Notification).where(Notification.id == nid, Notification.recipient_id == recipient_id)
        )
        return result.rowcount > 0

    async def purge_read_older_than(self, days: int) -> int:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        result = await self.db.execute(
            delete(Notification).where(Notification.is_read.is_(True), Notification.read_at < cutoff)
        )
        return result.rowcount
