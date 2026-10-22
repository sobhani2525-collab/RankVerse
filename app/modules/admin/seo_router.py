from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import envelope
from app.modules.admin.dependencies import get_current_admin
from app.modules.admin.models import AdminAccount
from app.modules.admin.seo_service import AdminSeoService

router = APIRouter(prefix="/admin/seo", tags=["admin-seo"])


@router.get("/overview")
async def seo_overview(
    response: Response, _admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db)
):
    response.headers["Cache-Control"] = "private, no-store"
    return envelope(data=(await AdminSeoService(db).overview()).model_dump(mode="json"))
