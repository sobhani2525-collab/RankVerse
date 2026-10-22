import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import Meta, envelope
from app.modules.admin.dependencies import get_current_admin
from app.modules.admin.models import AdminAccount

from .admin_schemas import AdminBattleFeaturedReorder, AdminBattleUpdate
from .admin_service import AdminBattleService

router = APIRouter(prefix="/admin/battles", tags=["admin"])


@router.get("")
async def admin_battles(
    q: str | None = Query(None, max_length=200),
    featured: bool | None = None,
    hidden: bool | None = None,
    official: bool | None = None,
    status: str | None = Query(None, pattern="^(active|completed|archived)$"),
    mode: str = Query("pool", pattern="^(pool|tournament)$"),
    sort: str = Query("newest", pattern="^(newest|popular|followed)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    _admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows, total = await AdminBattleService(db).search(
        q=q, featured=featured, hidden=hidden, official=official, status=status, mode=mode,
        sort=sort, page=page, page_size=page_size,
    )
    return envelope(
        data=[r.model_dump(mode="json") for r in rows],
        meta=Meta(page=page, page_size=page_size, total=total),
    )


@router.get("/featured")
async def admin_featured_battles(
    _admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = await AdminBattleService(db).featured()
    return envelope(data=[r.model_dump(mode="json") for r in rows])


@router.post("/featured/reorder")
async def admin_reorder_featured_battles(
    payload: AdminBattleFeaturedReorder,
    request: Request,
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = await AdminBattleService(db).reorder_featured(admin, payload.ids, request)
    return envelope(data=[r.model_dump(mode="json") for r in rows])


@router.patch("/{battle_id}")
async def admin_update_battle(
    battle_id: uuid.UUID,
    payload: AdminBattleUpdate,
    request: Request,
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    row = await AdminBattleService(db).update(admin, battle_id, payload, request)
    return envelope(data=row.model_dump(mode="json"))


@router.delete("/{battle_id}")
async def admin_archive_battle(
    battle_id: uuid.UUID,
    request: Request,
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Archive, never delete: the battle leaves every listing but its link and results keep working."""
    row = await AdminBattleService(db).archive(admin, battle_id, request)
    return envelope(data=row.model_dump(mode="json"))
