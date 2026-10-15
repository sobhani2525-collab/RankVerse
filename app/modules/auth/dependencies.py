import uuid

from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, get_read_db
from app.config import settings
from app.core.email import email_enabled
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import decode_token
from app.modules.users.models import User
from app.modules.users.repository import UserRepository

bearer_scheme = HTTPBearer(auto_error=False)

EMAIL_NOT_VERIFIED_MESSAGE = "برای این کار ابتدا ایمیل خود را تأیید کنید. لینک تأیید را از نوار بالای سایت دوباره بخواهید."


def ensure_email_verified(user: User) -> None:
    """Anti-spam gate for posting (comments, public lists): needs a confirmed email.
    Off unless email delivery is configured, so a site without SMTP never locks users out."""
    if settings.require_verified_email and email_enabled() and user.email_verified_at is None:
        raise ForbiddenError(EMAIL_NOT_VERIFIED_MESSAGE)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise UnauthorizedError("Missing bearer token")

    payload = decode_token(credentials.credentials)
    if payload is None or payload.get("type") != "access":
        raise UnauthorizedError("Invalid or expired token")

    user_id = payload.get("sub")
    user = await UserRepository(db).get_by_id(uuid.UUID(user_id))
    if user is None or not user.is_active or user.deleted_at is not None:
        raise UnauthorizedError("User not found or inactive")

    return user

async def get_current_user_read(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_read_db),
) -> User:
    """get_current_user for read-only endpoints: shares their no-transaction
    read session, so auth plus the endpoint's own reads skip the BEGIN and
    ROLLBACK round trips. Don't use it where the endpoint writes."""
    return await get_current_user(credentials, db)


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None

    payload = decode_token(credentials.credentials)
    if payload is None or payload.get("type") != "access":
        return None

    user_id = payload.get("sub")
    user = await UserRepository(db).get_by_id(uuid.UUID(user_id))
    if user is None or not user.is_active or user.deleted_at is not None:
        return None

    return user