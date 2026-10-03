import uuid

from fastapi import APIRouter, Depends, Query
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis
from app.core.schemas import envelope, Meta
from app.modules.admin.dependencies import get_current_admin
from app.modules.admin.models import AdminAccount
from app.modules.admin.schemas import AdminFeaturedReorder, AdminItemsReorder, AdminListUpdate, AdminLogin, AdminPasswordChange, AdminPublic
from app.modules.admin.service import AdminAuthService, AdminListService

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/auth/login")
async def login(payload: AdminLogin, db: AsyncSession = Depends(get_db)):
    service = AdminAuthService(db)
    tokens = await service.login(payload)
    return envelope(data=tokens.model_dump())


@router.post("/auth/logout")
async def logout(current_admin: AdminAccount = Depends(get_current_admin)):
    # Stateless JWT: the client drops the cookie/token. This endpoint exists
    # for symmetry with /auth/login and as the place to add token
    # blacklisting later if that becomes necessary.
    return envelope(data={"logged_out": True})


@router.get("/auth/me")
async def me(current_admin: AdminAccount = Depends(get_current_admin)):
    return envelope(data=AdminPublic.model_validate(current_admin).model_dump())


@router.patch("/auth/password")
async def change_password(
    payload: AdminPasswordChange,
    current_admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    service = AdminAuthService(db)
    await service.change_password(current_admin, payload, redis)
    return envelope(data={"changed": True})


# --- List curation ---

@router.get("/lists")
async def admin_lists(
    q: str | None = Query(None, max_length=200),
    featured: bool | None = None,
    hidden: bool | None = None,
    entity_type: str | None = None,
    min_items: int | None = Query(None, ge=0),
    sort: str = Query("newest", pattern="^(newest|popular|items)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    _admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows, total = await AdminListService(db).search(
        q=q, featured=featured, hidden=hidden, entity_type=entity_type,
        min_items=min_items, sort=sort, page=page, page_size=page_size,
    )
    return envelope(
        data=[r.model_dump(mode="json") for r in rows],
        meta=Meta(page=page, page_size=page_size, total=total),
    )


@router.get("/lists/featured")
async def admin_featured_lists(
    _admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = await AdminListService(db).featured()
    return envelope(data=[r.model_dump(mode="json") for r in rows])


@router.post("/lists/featured/reorder")
async def admin_reorder_featured(
    payload: AdminFeaturedReorder,
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = await AdminListService(db).reorder_featured(admin, payload.ids)
    return envelope(data=[r.model_dump(mode="json") for r in rows])


@router.patch("/lists/{list_id}")
async def admin_update_list(
    list_id: uuid.UUID,
    payload: AdminListUpdate,
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    row = await AdminListService(db).update(admin, list_id, payload)
    return envelope(data=row.model_dump(mode="json"))


@router.delete("/lists/{list_id}")
async def admin_delete_list(
    list_id: uuid.UUID,
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    await AdminListService(db).delete(admin, list_id)
    return envelope(data={"deleted": True})


@router.get("/lists/{list_id}/items")
async def admin_list_items(
    list_id: uuid.UUID,
    _admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = await AdminListService(db).items(list_id)
    return envelope(data=[r.model_dump(mode="json") for r in rows])


@router.delete("/lists/{list_id}/items/{item_id}")
async def admin_remove_list_item(
    list_id: uuid.UUID,
    item_id: uuid.UUID,
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = await AdminListService(db).remove_item(admin, list_id, item_id)
    return envelope(data=[r.model_dump(mode="json") for r in rows])


@router.put("/lists/{list_id}/items/reorder")
async def admin_reorder_list_items(
    list_id: uuid.UUID,
    payload: AdminItemsReorder,
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows = await AdminListService(db).reorder_items(admin, list_id, payload.item_ids)
    return envelope(data=[r.model_dump(mode="json") for r in rows])
