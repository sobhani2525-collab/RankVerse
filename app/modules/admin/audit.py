"""Append-only audit trail for admin actions. Reusable by every admin module:

    await AuditLogService(db).record(admin, "user.block", "user", user.id,
                                     before={...}, after={...}, request=request)

`record` only flushes: the caller commits, so the log row lands in the same
transaction as the change it describes (both or neither). Nothing here (or
anywhere else) updates or deletes audit rows.
"""
import uuid
from datetime import datetime
from typing import Any

from fastapi import Request
from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import client_ip
from app.modules.admin.models import AdminAccount, AdminAuditLog

# Never written to before/after, whatever a caller passes in.
SENSITIVE_KEYS = frozenset({
    "hashed_password", "password_hash", "password", "new_password", "current_password",
    "token", "access_token", "refresh_token", "reset_link", "secret",
})


def _clean(data: dict[str, Any] | None) -> dict[str, Any] | None:
    if data is None:
        return None
    return {k: v for k, v in data.items() if k not in SENSITIVE_KEYS}


def diff(before: dict[str, Any], after: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Just the keys whose value differs, as (before, after)."""
    keys = [k for k in after if before.get(k) != after.get(k)]
    return {k: before.get(k) for k in keys}, {k: after[k] for k in keys}


class AuditLogService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def record(
        self,
        admin: AdminAccount,
        action: str,
        target_type: str,
        target_id: uuid.UUID | str,
        *,
        before: dict[str, Any] | None = None,
        after: dict[str, Any] | None = None,
        request: Request | None = None,
    ) -> AdminAuditLog:
        user_agent = (request.headers.get("user-agent") or "")[:300] or None if request is not None else None
        row = AdminAuditLog(
            admin_id=admin.id,
            admin_email=admin.email,
            action=action,
            target_type=target_type,
            target_id=str(target_id),
            before=_clean(before),
            after=_clean(after),
            ip=client_ip(request) if request is not None else None,
            user_agent=user_agent,
        )
        self.db.add(row)
        await self.db.flush()
        return row

    async def for_target(
        self, target_type: str, target_id: uuid.UUID | str, page: int, page_size: int
    ) -> tuple[list[AdminAuditLog], int]:
        cond = (AdminAuditLog.target_type == target_type, AdminAuditLog.target_id == str(target_id))
        total = (await self.db.execute(select(func.count()).select_from(AdminAuditLog).where(*cond))).scalar_one()
        stmt = (
            select(AdminAuditLog).where(*cond)
            .order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id)
            .offset((page - 1) * page_size).limit(page_size)
        )
        return list((await self.db.execute(stmt)).scalars().all()), total


def _like(text: str) -> str:
    escaped = text.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def apply_filters(
    stmt: Select, *, admin_id: uuid.UUID | None = None, actions: list[str] | None = None,
    target_type: str | None = None, target_id: str | None = None,
    created_from: datetime | None = None, created_to: datetime | None = None, q: str | None = None,
) -> Select:
    if admin_id:
        stmt = stmt.where(AdminAuditLog.admin_id == admin_id)
    if actions:
        stmt = stmt.where(AdminAuditLog.action.in_(actions))
    if target_type:
        stmt = stmt.where(AdminAuditLog.target_type == target_type)
    if target_id:
        stmt = stmt.where(AdminAuditLog.target_id == target_id)
    if created_from:
        stmt = stmt.where(AdminAuditLog.created_at >= created_from)
    if created_to:
        stmt = stmt.where(AdminAuditLog.created_at <= created_to)
    if q and q.strip():
        like = _like(q)
        stmt = stmt.where(or_(
            AdminAuditLog.admin_email.ilike(like, escape="\\"),
            AdminAuditLog.target_id.ilike(like, escape="\\"),
        ))
    return stmt


class AuditLogQuery:
    """Read side of the audit log (newest first). There is no write API on purpose."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def search(self, *, page: int, page_size: int, **filters) -> tuple[list[AdminAuditLog], int]:
        stmt = apply_filters(select(AdminAuditLog, func.count().over().label("total")), **filters)
        stmt = stmt.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id).offset((page - 1) * page_size).limit(page_size)
        rows = (await self.db.execute(stmt)).all()
        return [r.AdminAuditLog for r in rows], (rows[0].total if rows else 0)

    async def count(self, **filters) -> int:
        stmt = apply_filters(select(func.count()).select_from(AdminAuditLog), **filters)
        return (await self.db.execute(stmt)).scalar_one()

    async def admins(self) -> list[tuple[uuid.UUID, str]]:
        """Admins that appear in the log, for the filter dropdown."""
        stmt = (
            select(AdminAuditLog.admin_id, func.max(AdminAuditLog.admin_email))
            .where(AdminAuditLog.admin_id.is_not(None))
            .group_by(AdminAuditLog.admin_id)
            .order_by(func.max(AdminAuditLog.admin_email))
        )
        return [(i, e) for i, e in (await self.db.execute(stmt)).all()]
