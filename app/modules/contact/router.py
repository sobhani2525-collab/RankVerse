"""Public contact form (bug reports, inappropriate content, ...) and the admin inbox that reads it."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.core.rate_limit import client_ip, enforce
from app.core.schemas import Meta, envelope
from app.modules.admin.audit import AuditLogService, diff
from app.modules.admin.dependencies import get_current_admin
from app.modules.admin.models import AdminAccount
from app.modules.auth.dependencies import get_current_user_optional
from app.modules.contact.models import CATEGORIES, ContactMessage
from app.modules.contact.schemas import ContactCreate, ContactUpdate
from app.modules.users.models import User

router = APIRouter(tags=["contact"])

SEND_LIMIT = 5
HOUR = 3600


def _row(m: ContactMessage, username: str | None = None) -> dict:
    return {
        "id": str(m.id), "category": m.category, "subject": m.subject, "message": m.message,
        "name": m.name, "email": m.email, "page_url": m.page_url,
        "user_id": str(m.user_id) if m.user_id else None, "username": username,
        "status": m.status, "admin_note": m.admin_note,
        "reviewed_at": m.reviewed_at.isoformat() if m.reviewed_at else None,
        "created_at": m.created_at.isoformat(),
    }


@router.post("/contact", status_code=201)
async def send_message(
    payload: ContactCreate,
    request: Request,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    ip = client_ip(request)
    await enforce("contact", ip, SEND_LIMIT, HOUR)
    if payload.website:  # honeypot filled in: look accepted, store nothing
        return envelope(data={"received": True})
    db.add(ContactMessage(
        category=payload.category, subject=payload.subject, message=payload.message,
        name=payload.name, email=payload.email or (user.email if user else None), page_url=payload.page_url,
        user_id=user.id if user else None, ip=ip,
        user_agent=(request.headers.get("user-agent") or "")[:300] or None,
    ))
    await db.commit()
    return envelope(data={"received": True})


@router.get("/admin/contact-messages")
async def list_messages(
    response: Response,
    status: str | None = Query(None, pattern="^(new|reviewed)$"),
    category: str | None = Query(None, pattern=f"^({'|'.join(CATEGORIES)})$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    _: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    response.headers["Cache-Control"] = "private, no-store"
    conditions = []
    if status:
        conditions.append(ContactMessage.status == status)
    if category:
        conditions.append(ContactMessage.category == category)
    total = (await db.execute(select(func.count()).select_from(ContactMessage).where(*conditions))).scalar_one()
    rows = (
        await db.execute(
            select(ContactMessage, User.username)
            .outerjoin(User, User.id == ContactMessage.user_id)
            .where(*conditions)
            .order_by(ContactMessage.created_at.desc(), ContactMessage.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return envelope(data=[_row(m, username) for m, username in rows], meta=Meta(page=page, page_size=page_size, total=total))


@router.get("/admin/contact-messages/new-count")
async def new_count(response: Response, _: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    count = (await db.execute(select(func.count()).select_from(ContactMessage).where(ContactMessage.status == "new"))).scalar_one()
    return envelope(data={"count": count})


@router.patch("/admin/contact-messages/{message_id}")
async def update_message(
    message_id: uuid.UUID,
    payload: ContactUpdate,
    request: Request,
    admin: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    m = await db.get(ContactMessage, message_id)
    if m is None:
        raise NotFoundError("Message not found")
    before = {"status": m.status, "admin_note": m.admin_note}
    if payload.status is not None and payload.status != m.status:
        m.status = payload.status
        m.reviewed_at = datetime.now(timezone.utc) if payload.status == "reviewed" else None
        m.reviewed_by = admin.id if payload.status == "reviewed" else None
    if "admin_note" in payload.model_fields_set:
        m.admin_note = (payload.admin_note or "").strip() or None
    changed_before, changed_after = diff(before, {"status": m.status, "admin_note": m.admin_note})
    if changed_after:
        await AuditLogService(db).record(
            admin, "contact.update", "contact_message", m.id, before=changed_before, after=changed_after, request=request
        )
    await db.commit()
    username = (await db.execute(select(User.username).where(User.id == m.user_id))).scalar_one_or_none() if m.user_id else None
    return envelope(data=_row(m, username))
