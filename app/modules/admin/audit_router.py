"""Read-only API over the admin audit log. GET only: the log is append-only,
so there is no route here (or anywhere) that edits or deletes a row."""
import csv
import io
import json
import uuid
from datetime import date, datetime
from typing import AsyncIterator

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import database
from app.core.database import get_db
from app.core.exceptions import ValidationError
from app.core.rate_limit import enforce
from app.core.schemas import Meta, envelope
from app.modules.admin.audit import AuditLogQuery, AuditLogService
from app.modules.admin.dependencies import get_current_admin
from app.modules.admin.models import AdminAccount
from app.modules.admin.users_schemas import AdminAuditLogRow

router = APIRouter(prefix="/admin/audit-logs", tags=["admin-audit"])

EXPORT_ROW_CAP = 50_000
EXPORT_RATE_LIMIT = 10
EXPORT_RATE_WINDOW_SECONDS = 10 * 60
BATCH_SIZE = 1000
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
COLUMNS = ("created_at", "admin_email", "action", "target_type", "target_id", "ip", "user_agent", "before", "after")


def _filters(
    admin_id: uuid.UUID | None = None,
    action: list[str] | None = Query(None, max_length=50, description="repeat for several actions"),
    target_type: str | None = Query(None, max_length=40),
    target_id: str | None = Query(None, max_length=64),
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    q: str | None = Query(None, max_length=200),
) -> dict:
    return dict(
        admin_id=admin_id, actions=action, target_type=target_type, target_id=target_id,
        created_from=created_from, created_to=created_to, q=q,
    )


@router.get("")
async def list_audit_logs(
    filters: dict = Depends(_filters),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    _admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows, total = await AuditLogQuery(db).search(page=page, page_size=page_size, **filters)
    return envelope(
        data=[AdminAuditLogRow.model_validate(r, from_attributes=True).model_dump(mode="json") for r in rows],
        meta=Meta(page=page, page_size=page_size, total=total),
    )


@router.get("/admins")
async def audit_admins(_admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    return envelope(data=[{"id": str(i), "email": e} for i, e in await AuditLogQuery(db).admins()])


def _cell(value):
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value


async def _stream_csv(filters: dict) -> AsyncIterator[bytes]:
    head = io.StringIO()
    csv.writer(head).writerow(COLUMNS)
    yield ("﻿" + head.getvalue()).encode("utf-8")  # BOM so Excel reads Persian as UTF-8
    async with database.background_read_session() as session:
        query = AuditLogQuery(session)
        page = 1
        while True:
            rows, _total = await query.search(page=page, page_size=BATCH_SIZE, **filters)
            if not rows:
                break
            buf = io.StringIO()
            writer = csv.writer(buf)
            for row in rows:
                writer.writerow([_cell(getattr(row, c)) for c in COLUMNS])
            yield buf.getvalue().encode("utf-8")
            if len(rows) < BATCH_SIZE:
                break
            page += 1


@router.get("/export")
async def export_audit_logs(
    request: Request,
    filters: dict = Depends(_filters),
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    await enforce("admin-audit-export", str(admin.id), EXPORT_RATE_LIMIT, EXPORT_RATE_WINDOW_SECONDS)
    total = await AuditLogQuery(db).count(**filters)
    if total > EXPORT_ROW_CAP:
        raise ValidationError(
            f"The export would contain {total} rows; the limit is {EXPORT_ROW_CAP}. Narrow the filters and try again"
        )
    await AuditLogService(db).record(
        admin, "audit_log.export", "audit_log", "export",
        after={"rows": total, "filters": {k: (v.isoformat() if isinstance(v, datetime) else str(v)) for k, v in filters.items() if v}},
        request=request,
    )
    await db.commit()
    return StreamingResponse(
        _stream_csv(filters),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="rankverse-audit-log-{date.today().isoformat()}.csv"',
            "Cache-Control": "no-store",
        },
    )
