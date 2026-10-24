import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import Meta, envelope
from app.modules.admin.dependencies import get_current_admin
from app.modules.admin.entities_schemas import AdminEntityOverviewUpdate, AdminEntityTrailerUpdate
from app.modules.admin.entities_service import AdminEntityService
from app.modules.admin.models import AdminAccount

router = APIRouter(prefix="/admin/entities", tags=["admin-entities"])


@router.get("")
async def list_entity_overviews(
    q: str | None = Query(None, max_length=200),
    source: str | None = Query(None, pattern="^(tmdb_fa|machine|manual|en)$"),
    trailer: str | None = Query(None, pattern="^(aparat|none)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows, total = await AdminEntityService(db).search(q, source, page, page_size, trailer)
    return envelope(
        data=[r.model_dump(mode="json") for r in rows],
        meta=Meta(page=page, page_size=page_size, total=total),
    )


@router.put("/{entity_id}/overview")
async def set_entity_overview(
    entity_id: uuid.UUID, payload: AdminEntityOverviewUpdate, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    row = await AdminEntityService(db).set_manual_overview(admin, entity_id, payload.overview, request)
    return envelope(data=row.model_dump(mode="json"))


@router.delete("/{entity_id}/overview")
async def reset_entity_overview(
    entity_id: uuid.UUID, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    row = await AdminEntityService(db).reset_overview(admin, entity_id, request)
    return envelope(data=row.model_dump(mode="json"))


@router.put("/{entity_id}/trailer")
async def set_entity_trailer(
    entity_id: uuid.UUID, payload: AdminEntityTrailerUpdate, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    row = await AdminEntityService(db).set_aparat_trailer(admin, entity_id, payload.url, request)
    return envelope(data=row.model_dump(mode="json"))


@router.delete("/{entity_id}/trailer")
async def remove_entity_trailer(
    entity_id: uuid.UUID, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    row = await AdminEntityService(db).remove_aparat_trailer(admin, entity_id, request)
    return envelope(data=row.model_dump(mode="json"))
