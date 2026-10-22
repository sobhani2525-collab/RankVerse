from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ValidationError
from app.core.schemas import envelope
from app.modules.admin.analytics_service import RANGES, AdminAnalyticsService
from app.modules.admin.dependencies import get_current_admin
from app.modules.admin.models import AdminAccount

router = APIRouter(prefix="/admin/analytics", tags=["admin-analytics"])


@router.get("")
async def analytics(
    response: Response,
    days: int = Query(30, description="7, 30 or 90"),
    _admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    if days not in RANGES:
        raise ValidationError("days must be 7, 30 or 90")
    response.headers["Cache-Control"] = "private, no-store"
    return envelope(data=(await AdminAnalyticsService(db).analytics(days)).model_dump(mode="json"))
