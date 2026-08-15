from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import envelope
from app.core.security import create_access_token, decode_token
from app.core.exceptions import UnauthorizedError
from app.modules.auth.dependencies import get_current_user
from app.modules.users.models import User
from app.modules.users.schemas import UserCreate, UserLogin, UserPublic, TokenPair
from app.modules.users.service import UserService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    service = UserService(db)
    user = await service.register(payload)
    return envelope(data=UserPublic.model_validate(user).model_dump())


@router.post("/login")
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    service = UserService(db)
    tokens = await service.login(payload)
    return envelope(data=tokens.model_dump())


@router.post("/refresh")
async def refresh(refresh_token: str):
    payload = decode_token(refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise UnauthorizedError("Invalid or expired refresh token")

    new_access = create_access_token(payload["sub"])
    return envelope(data={"access_token": new_access, "token_type": "bearer"})


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return envelope(data=UserPublic.model_validate(current_user).model_dump())
