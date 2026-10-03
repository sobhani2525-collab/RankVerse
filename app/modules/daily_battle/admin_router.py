import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import Meta, envelope
from app.modules.admin.dependencies import get_current_admin
from app.modules.admin.models import AdminAccount

from .admin_service import AdminDailyBattleService
from .schemas import AdminDailyBattleCreate, AdminDailyBattleUpdate

router = APIRouter(prefix="/admin/daily-battles", tags=["admin"])


@router.get("")
async def admin_list_daily_battles(
    from_date: date | None = None,
    to_date: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    _admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Defaults to 14 days back and 14 days ahead of today (Tehran)."""
    rows, total = await AdminDailyBattleService(db).list(from_date, to_date, page, page_size)
    return envelope(
        data=[r.model_dump(mode="json") for r in rows],
        meta=Meta(page=page, page_size=page_size, total=total),
    )


@router.post("", status_code=201)
async def admin_create_daily_battle(
    payload: AdminDailyBattleCreate,
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    row = await AdminDailyBattleService(db).create(admin, payload)
    return envelope(data=row.model_dump(mode="json"))


@router.put("/{battle_id}")
async def admin_update_daily_battle(
    battle_id: uuid.UUID,
    payload: AdminDailyBattleUpdate,
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    row = await AdminDailyBattleService(db).update(admin, battle_id, payload)
    return envelope(data=row.model_dump(mode="json"))


@router.delete("/{battle_id}")
async def admin_delete_daily_battle(
    battle_id: uuid.UUID,
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    await AdminDailyBattleService(db).delete(admin, battle_id)
    return envelope(data={"deleted": True})
