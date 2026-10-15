"""Append-only audit trail for admin actions. Reusable by every admin module:

    await AuditLogService(db).record(admin, "user.block", "user", user.id,
                                     before={...}, after={...}, request=request)

`record` only flushes: the caller commits, so the log row lands in the same
transaction as the change it describes (both or neither). Nothing here (or
anywhere else) updates or deletes audit rows.
"""
import uuid
from typing import Any

from fastapi import Request
from sqlalchemy import func, select
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
