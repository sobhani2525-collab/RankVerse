"""Operational alerts for admins.

`raise_alert` is safe to call from anywhere, including exception handlers: it
never raises, opens its own DB session, and ignores calls made while it is
already running (an alert about alerting must not recurse).
"""
import asyncio
import logging
import time
import uuid
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from typing import Protocol

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core import database
from app.core.exceptions import NotFoundError, ValidationError
from app.modules.alerts.models import SEVERITIES, AdminAlert

logger = logging.getLogger(__name__)

_in_alert: ContextVar[bool] = ContextVar("in_alert", default=False)
_background: set[asyncio.Task] = set()
_DETAIL_STR_MAX = 1000


class AlertChannel(Protocol):
    async def send(self, alert: dict) -> None: ...


class LogChannel:
    async def send(self, alert: dict) -> None:
        logger.warning("ADMIN ALERT [%s/%s] %s", alert["severity"], alert["source"], alert["title"])


class WebhookChannel:
    """Generic JSON POST; point it at an Eitaa/Telegram/email bridge."""

    def __init__(self, url: str):
        self.url = url

    async def send(self, alert: dict) -> None:
        async with httpx.AsyncClient(timeout=settings.alert_webhook_timeout_seconds) as client:
            await client.post(self.url, json=alert)


def build_channels() -> list[AlertChannel]:
    """The DB row (shown in the admin panel) is always written by the service
    itself; these are the extra outbound channels."""
    channels: list[AlertChannel] = [LogChannel()]
    if settings.alert_webhook_url:
        channels.append(WebhookChannel(settings.alert_webhook_url))
    return channels


def _clean(value, depth: int = 0):
    if isinstance(value, str):
        return value[:_DETAIL_STR_MAX]
    if isinstance(value, dict) and depth < 3:
        return {str(k)[:60]: _clean(v, depth + 1) for k, v in list(value.items())[:30]}
    if isinstance(value, (list, tuple)) and depth < 3:
        return [_clean(v, depth + 1) for v in list(value)[:30]]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return str(value)[:_DETAIL_STR_MAX]


class AlertService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def record(
        self, severity: str, source: str, title: str, details: dict | None = None, fingerprint: str | None = None
    ) -> tuple[AdminAlert, bool]:
        """Returns (alert, is_new). A repeat of an open alert only bumps its
        counters; a repeat shortly after resolution reopens that row quietly."""
        if severity not in SEVERITIES:
            raise ValidationError(f"Unknown severity '{severity}'")
        fingerprint = (fingerprint or f"{source}:{title}")[:200]
        now = datetime.now(timezone.utc)
        details = _clean(details or {})

        open_row = (
            await self.db.execute(
                select(AdminAlert).where(AdminAlert.fingerprint == fingerprint, AdminAlert.resolved_at.is_(None)).with_for_update()
            )
        ).scalar_one_or_none()
        if open_row is not None:
            open_row.occurrences += 1
            open_row.last_seen_at = now
            open_row.details = details or open_row.details
            if SEVERITIES.index(severity) > SEVERITIES.index(open_row.severity):
                open_row.severity = severity
            return open_row, False

        cutoff = now - timedelta(seconds=settings.alert_cooldown_seconds)
        recently_resolved = (
            await self.db.execute(
                select(AdminAlert)
                .where(AdminAlert.fingerprint == fingerprint, AdminAlert.resolved_at >= cutoff)
                .order_by(AdminAlert.resolved_at.desc())
                .limit(1)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if recently_resolved is not None:
            recently_resolved.resolved_at = None
            recently_resolved.occurrences += 1
            recently_resolved.last_seen_at = now
            return recently_resolved, False

        alert = AdminAlert(
            severity=severity, source=source, title=title[:300], details=details, fingerprint=fingerprint,
            first_seen_at=now, last_seen_at=now,
        )
        self.db.add(alert)
        await self.db.flush()
        return alert, True

    # --- admin panel operations ---

    async def list(self, severity: str | None, status: str, limit: int) -> list[AdminAlert]:
        stmt = select(AdminAlert)
        if severity:
            stmt = stmt.where(AdminAlert.severity == severity)
        if status == "open":
            stmt = stmt.where(AdminAlert.resolved_at.is_(None))
        elif status == "unacknowledged":
            stmt = stmt.where(AdminAlert.resolved_at.is_(None), AdminAlert.acknowledged_at.is_(None))
        elif status == "resolved":
            stmt = stmt.where(AdminAlert.resolved_at.is_not(None))
        stmt = stmt.order_by(AdminAlert.last_seen_at.desc()).limit(min(max(limit, 1), 200))
        return list((await self.db.execute(stmt)).scalars())

    async def open_count(self) -> int:
        stmt = select(func.count()).select_from(AdminAlert).where(AdminAlert.resolved_at.is_(None))
        return (await self.db.execute(stmt)).scalar_one()

    async def acknowledge(self, alert_id: uuid.UUID, admin_id: uuid.UUID) -> AdminAlert:
        alert = await self._get(alert_id)
        alert.acknowledged_by = admin_id
        alert.acknowledged_at = datetime.now(timezone.utc)
        await self.db.commit()
        return alert

    async def resolve(self, alert_id: uuid.UUID, admin_id: uuid.UUID) -> AdminAlert:
        alert = await self._get(alert_id)
        if alert.resolved_at is None:
            alert.resolved_at = datetime.now(timezone.utc)
        if alert.acknowledged_at is None:
            alert.acknowledged_by = admin_id
            alert.acknowledged_at = alert.resolved_at
        await self.db.commit()
        return alert

    async def _get(self, alert_id: uuid.UUID) -> AdminAlert:
        alert = await self.db.get(AdminAlert, alert_id)
        if alert is None:
            raise NotFoundError("Alert not found")
        return alert

    async def maintenance(self) -> dict:
        """Purge old resolved alerts and check the database size."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=settings.alert_retention_days)
        deleted = (
            await self.db.execute(
                text("DELETE FROM admin_alerts WHERE resolved_at IS NOT NULL AND resolved_at < :c"), {"c": cutoff}
            )
        ).rowcount
        await self.db.commit()
        size_mb = None
        if settings.alert_db_size_warn_mb > 0:
            size_mb = (await self.db.execute(text("SELECT pg_database_size(current_database()) / 1048576"))).scalar_one()
            if size_mb >= settings.alert_db_size_warn_mb:
                await raise_alert(
                    "warning", "db_size", f"حجم دیتابیس به {int(size_mb)} مگابایت رسید",
                    {"size_mb": int(size_mb), "threshold_mb": settings.alert_db_size_warn_mb},
                    fingerprint="db_size",
                )
        return {"purged": deleted, "db_size_mb": int(size_mb) if size_mb is not None else None}


async def raise_alert(
    severity: str, source: str, title: str, details: dict | None = None, fingerprint: str | None = None
) -> None:
    """Record + fan out an alert. Never raises, never recurses."""
    if _in_alert.get():
        return
    token = _in_alert.set(True)
    try:
        async with database.AsyncSessionLocal() as db:
            alert, is_new = await AlertService(db).record(severity, source, title, details, fingerprint)
            await db.commit()
            payload = {
                "severity": alert.severity, "source": alert.source, "title": alert.title,
                "details": alert.details, "occurrences": alert.occurrences,
            }
        if is_new:
            for channel in build_channels():
                try:
                    await channel.send(payload)
                except Exception:
                    logger.warning("alert channel %s failed", type(channel).__name__, exc_info=True)
    except Exception:
        logger.warning("could not record admin alert %r", title, exc_info=True)
    finally:
        _in_alert.reset(token)


def raise_alert_nowait(*args, **kwargs) -> None:
    """Schedule `raise_alert` without making the caller (e.g. an error
    response) wait for it. No-op outside a running loop."""
    if _in_alert.get():
        return
    try:
        task = asyncio.get_running_loop().create_task(raise_alert(*args, **kwargs))
    except RuntimeError:
        return
    _background.add(task)
    task.add_done_callback(_background.discard)


# --- in-process sliding window for admin login failures (no Redis) ---

_login_failures: dict[str, list[float]] = {}


def note_admin_login_failure(ip: str | None, email: str | None) -> None:
    key = ip or "unknown"
    now = time.monotonic()
    window = settings.alert_admin_login_fail_window_seconds
    hits = [t for t in _login_failures.get(key, []) if now - t < window]
    hits.append(now)
    _login_failures[key] = hits
    if len(_login_failures) > 1000:  # bound memory
        for k in [k for k, v in _login_failures.items() if not v or now - v[-1] >= window]:
            _login_failures.pop(k, None)
    if len(hits) >= settings.alert_admin_login_fail_threshold:
        raise_alert_nowait(
            "critical", "admin_login", "تلاش‌های ناموفق مکرر برای ورود به پنل ادمین",
            {"ip": key, "attempts_in_window": len(hits), "last_email": (email or "")[:100]},
            fingerprint=f"admin_login:{key}",
        )
