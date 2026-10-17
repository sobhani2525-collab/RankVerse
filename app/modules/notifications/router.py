import uuid

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, get_read_db
from app.core.schemas import envelope
from app.modules.auth.dependencies import get_current_user, get_current_user_read
from app.modules.notifications.schemas import PreferencesUpdate
from app.modules.notifications.service import NotificationService
from app.modules.sync.dependencies import verify_internal_api_key
from app.modules.users.models import User

router = APIRouter(tags=["notifications"])


def _private(response: Response) -> None:
    # Per-user data: never let a CDN or shared cache keep it.
    response.headers["Cache-Control"] = "private, no-store"


@router.get("/notifications")
async def list_notifications(
    response: Response,
    cursor: str | None = None,
    limit: int | None = Query(None, ge=1),
    user: User = Depends(get_current_user_read),
    db: AsyncSession = Depends(get_read_db),
):
    _private(response)
    page = await NotificationService(db).list(user.id, cursor, limit)
    return envelope(data=page.model_dump(mode="json"))


@router.get("/notifications/unread-count")
async def unread_count(
    response: Response,
    user: User = Depends(get_current_user_read),
    db: AsyncSession = Depends(get_read_db),
):
    _private(response)
    return envelope(data={"count": await NotificationService(db).unread_count(user.id)})


@router.get("/notifications/preferences")
async def get_preferences(
    response: Response,
    user: User = Depends(get_current_user_read),
    db: AsyncSession = Depends(get_read_db),
):
    _private(response)
    return envelope(data=await NotificationService(db).get_preferences(user.id))


@router.put("/notifications/preferences")
async def update_preferences(
    payload: PreferencesUpdate,
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _private(response)
    return envelope(data=await NotificationService(db).update_preferences(user.id, payload.preferences))


@router.post("/notifications/read-all")
async def read_all(response: Response, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    _private(response)
    return envelope(data={"updated": await NotificationService(db).mark_all_read(user.id)})


@router.post("/notifications/{notification_id}/read")
async def read_one(
    notification_id: uuid.UUID,
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _private(response)
    await NotificationService(db).mark_read(user.id, notification_id)
    return envelope(data={"read": True})


@router.delete("/notifications/{notification_id}")
async def delete_one(
    notification_id: uuid.UUID,
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _private(response)
    await NotificationService(db).delete(user.id, notification_id)
    return envelope(data={"deleted": True})


@router.post("/internal/notifications/cleanup", dependencies=[Depends(verify_internal_api_key)])
async def cleanup(db: AsyncSession = Depends(get_db)):
    return envelope(data={"deleted": await NotificationService(db).cleanup()})
