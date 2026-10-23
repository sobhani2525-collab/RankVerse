from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import envelope
from app.modules.admin.dependencies import get_current_admin
from app.modules.admin.ingestion_schemas import IngestionSyncRequest
from app.modules.admin.ingestion_service import AdminIngestionService
from app.modules.admin.models import AdminAccount

router = APIRouter(prefix="/admin/ingestion", tags=["admin-ingestion"])


@router.get("/overview")
async def ingestion_overview(
    response: Response, _admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db)
):
    response.headers["Cache-Control"] = "private, no-store"
    return envelope(data=(await AdminIngestionService(db).overview()).model_dump(mode="json"))


@router.get("/tmdb-check")
async def tmdb_check(_admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    return envelope(data=(await AdminIngestionService(db).tmdb_check()).model_dump(mode="json"))


@router.post("/sync")
async def sync_title(
    payload: IngestionSyncRequest, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    result = await AdminIngestionService(db).sync(admin, payload, request)
    return envelope(data=result.model_dump(mode="json"))
