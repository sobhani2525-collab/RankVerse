import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import get_db
from app.core.email import email_enabled, password_reset_email, send_email
from app.core.schemas import Meta, envelope
from app.modules.admin.dependencies import get_current_admin
from app.modules.admin.models import AdminAccount
from app.modules.admin.users_repository import SORTS
from app.modules.admin.users_schemas import AdminAuditLogRow, AdminUserBlock, AdminUserUpdate
from app.modules.admin.users_service import ACTIVITY_KINDS, AdminUserService

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


def _json(model) -> dict:
    return model.model_dump(mode="json")


@router.get("")
async def list_users(
    q: str | None = Query(None, max_length=200),
    status: str | None = Query(None, pattern="^(active|blocked|deleted|all)$"),
    email_verified: bool | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
    last_login_from: datetime | None = None,
    last_login_to: datetime | None = None,
    never_logged_in: bool | None = None,
    sort: str = Query("created_at", pattern=f"^({'|'.join(SORTS)})$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    _admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows, total = await AdminUserService(db).search(
        q=q, status=status, email_verified=email_verified, created_from=created_from, created_to=created_to,
        last_login_from=last_login_from, last_login_to=last_login_to, never_logged_in=never_logged_in,
        sort=sort, order=order, page=page, page_size=page_size,
    )
    return envelope(data=[_json(r) for r in rows], meta=Meta(page=page, page_size=page_size, total=total))


@router.get("/stats")
async def user_stats(_admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    return envelope(data=_json(await AdminUserService(db).stats()))


@router.get("/{user_id}")
async def get_user(user_id: uuid.UUID, _admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    return envelope(data=_json(await AdminUserService(db).detail(user_id)))


@router.patch("/{user_id}")
async def update_user(
    user_id: uuid.UUID, payload: AdminUserUpdate, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    return envelope(data=_json(await AdminUserService(db).update(admin, user_id, payload, request)))


@router.post("/{user_id}/block")
async def block_user(
    user_id: uuid.UUID, payload: AdminUserBlock, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    return envelope(data=_json(await AdminUserService(db).block(admin, user_id, payload, request)))


@router.post("/{user_id}/unblock")
async def unblock_user(
    user_id: uuid.UUID, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    return envelope(data=_json(await AdminUserService(db).unblock(admin, user_id, request)))


@router.delete("/{user_id}")
async def delete_user(
    user_id: uuid.UUID, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    return envelope(data=_json(await AdminUserService(db).delete(admin, user_id, request)))


@router.post("/{user_id}/restore")
async def restore_user(
    user_id: uuid.UUID, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    return envelope(data=_json(await AdminUserService(db).restore(admin, user_id, request)))


@router.post("/{user_id}/verify-email")
async def verify_user_email(
    user_id: uuid.UUID, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    return envelope(data=_json(await AdminUserService(db).verify_email(admin, user_id, request)))


@router.post("/{user_id}/send-password-reset")
async def send_password_reset(
    user_id: uuid.UUID, request: Request, background: BackgroundTasks,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    user, link = await AdminUserService(db).password_reset_link(admin, user_id, request)
    subject, text, html = password_reset_email(link)
    background.add_task(send_email, user.email, subject, text, html)
    data: dict = {"sent": True}
    # Same local-only convenience as /auth/forgot-password.
    if settings.environment != "production" and not email_enabled():
        data["dev_reset_link"] = link
    return envelope(data=data)


@router.get("/{user_id}/activity")
async def user_activity(
    user_id: uuid.UUID,
    kind: str = Query("ratings", pattern=f"^({'|'.join(ACTIVITY_KINDS)})$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows, total = await AdminUserService(db).activity(user_id, kind, page, page_size)
    return envelope(
        data=[{**r, "id": str(r["id"]), "created_at": r["created_at"].isoformat()} for r in rows],
        meta=Meta(page=page, page_size=page_size, total=total),
    )


@router.get("/{user_id}/audit-logs")
async def user_audit_logs(
    user_id: uuid.UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    rows, total = await AdminUserService(db).audit_logs(user_id, page, page_size)
    return envelope(
        data=[_json(AdminAuditLogRow.model_validate(r, from_attributes=True)) for r in rows],
        meta=Meta(page=page, page_size=page_size, total=total),
    )
