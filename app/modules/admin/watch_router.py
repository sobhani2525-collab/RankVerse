import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import Meta, envelope
from app.modules.admin.dependencies import get_current_admin
from app.modules.admin.models import AdminAccount
from app.modules.watch.providers import ACCESS_TYPES, PROVIDERS
from app.modules.watch.schemas import WatchLinkImport, WatchLinkUpsert
from app.modules.watch.service import WatchService

router = APIRouter(prefix="/admin/watch-links", tags=["admin-watch-links"])


@router.get("/providers")
async def providers(_admin: AdminAccount = Depends(get_current_admin)):
    return envelope(data={
        "providers": [{"key": p.key, "name": p.name, "domains": list(p.domains)} for p in PROVIDERS],
        "access_types": [{"key": k, "name": v} for k, v in ACCESS_TYPES.items()],
    })


@router.get("/entities")
async def search_entities(
    q: str = Query(..., min_length=2, max_length=200),
    _admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    hits = await WatchService(db).search_entities(q)
    return envelope(data=[h.model_dump(mode="json") for h in hits])


@router.get("")
async def list_links(
    q: str | None = Query(None, max_length=200),
    provider: str | None = Query(None, max_length=30),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows, total = await WatchService(db).list_links(q, provider, page, page_size)
    return envelope(
        data=[r.model_dump(mode="json") for r in rows],
        meta=Meta(page=page, page_size=page_size, total=total),
    )


@router.put("")
async def upsert_link(
    payload: WatchLinkUpsert, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    row = await WatchService(db).upsert(admin, payload, request)
    return envelope(data=row.model_dump(mode="json"))


@router.post("/import")
async def import_links(
    payload: WatchLinkImport, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    results = await WatchService(db).import_rows(admin, payload.rows, request)
    return envelope(data=[r.model_dump(mode="json") for r in results])


@router.delete("/{link_id}")
async def delete_link(
    link_id: uuid.UUID, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    await WatchService(db).delete(admin, link_id, request)
    return envelope(data={"deleted": True})
