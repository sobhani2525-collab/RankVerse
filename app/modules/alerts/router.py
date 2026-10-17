import uuid

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import envelope
from app.modules.admin.dependencies import get_current_admin
from app.modules.admin.models import AdminAccount
from app.modules.alerts.models import AdminAlert
from app.modules.alerts.service import AlertService
from app.modules.sync.dependencies import verify_internal_api_key

router = APIRouter(tags=["admin-alerts"])


def _row(a: AdminAlert) -> dict:
    return {
        "id": str(a.id), "severity": a.severity, "source": a.source, "title": a.title, "details": a.details,
        "occurrences": a.occurrences, "first_seen_at": a.first_seen_at.isoformat(),
        "last_seen_at": a.last_seen_at.isoformat(),
        "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
        "acknowledged_at": a.acknowledged_at.isoformat() if a.acknowledged_at else None,
        "acknowledged_by": str(a.acknowledged_by) if a.acknowledged_by else None,
    }


@router.get("/admin/alerts")
async def list_alerts(
    response: Response,
    severity: str | None = Query(None, pattern="^(info|warning|critical)$"),
    status: str = Query("open", pattern="^(open|unacknowledged|resolved|all)$"),
    limit: int = Query(100, ge=1, le=200),
    _: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "private, no-store"
    rows = await AlertService(db).list(severity, status, limit)
    return envelope(data=[_row(r) for r in rows])


@router.get("/admin/alerts/open-count")
async def open_count(
    response: Response, _: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db)
):
    response.headers["Cache-Control"] = "private, no-store"
    return envelope(data={"count": await AlertService(db).open_count()})


@router.post("/admin/alerts/{alert_id}/acknowledge")
async def acknowledge(
    alert_id: uuid.UUID, admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db)
):
    return envelope(data=_row(await AlertService(db).acknowledge(alert_id, admin.id)))


@router.post("/admin/alerts/{alert_id}/resolve")
async def resolve(
    alert_id: uuid.UUID, admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db)
):
    return envelope(data=_row(await AlertService(db).resolve(alert_id, admin.id)))


@router.post("/internal/alerts/maintenance", dependencies=[Depends(verify_internal_api_key)])
async def maintenance(db: AsyncSession = Depends(get_db)):
    return envelope(data=await AlertService(db).maintenance())
