from fastapi import APIRouter, Depends
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis
from app.core.schemas import envelope
from app.modules.admin.dependencies import get_current_admin
from app.modules.admin.models import AdminAccount
from app.modules.admin.schemas import AdminLogin, AdminPasswordChange, AdminPublic
from app.modules.admin.service import AdminAuthService

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
