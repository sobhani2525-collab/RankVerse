import uuid

from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import UnauthorizedError
from app.core.security import decode_token
from app.modules.admin.models import AdminAccount
from app.modules.admin.repository import AdminAccountRepository

admin_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(admin_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> AdminAccount:
    if credentials is None:
        raise UnauthorizedError("Missing bearer token")

    payload = decode_token(credentials.credentials)
    if payload is None or payload.get("type") != "admin_access":
        raise UnauthorizedError("Invalid or expired admin token")

    admin_id = payload.get("sub")
    admin = await AdminAccountRepository(db).get_by_id(uuid.UUID(admin_id))
    if admin is None or not admin.is_active:
        raise UnauthorizedError("Admin account not found or inactive")

    return admin
