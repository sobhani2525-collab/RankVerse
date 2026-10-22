from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import envelope
from app.modules.admin.dashboard_service import AdminDashboardService
from app.modules.admin.dependencies import get_current_admin
from app.modules.admin.models import AdminAccount

router = APIRouter(prefix="/admin/dashboard", tags=["admin-dashboard"])


@router.get("/stats")
async def dashboard_stats(
    response: Response, _admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db)
):
    response.headers["Cache-Control"] = "private, no-store"
    return envelope(data=(await AdminDashboardService(db).stats()).model_dump(mode="json"))
