from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.database import get_db
from app.core.email import email_enabled, password_reset_email, send_email
from app.core.rate_limit import client_ip, enforce
from app.core.schemas import envelope
from app.core.security import create_access_token, decode_token
from app.core.exceptions import UnauthorizedError
from app.modules.auth.dependencies import get_current_user
from app.modules.users.models import User
from app.modules.users.schemas import (
    UserCreate, UserLogin, UserPublic, TokenPair, ForgotPasswordRequest, ResetPasswordRequest,
)
from app.modules.users.service import UserService

router = APIRouter(prefix="/auth", tags=["auth"])

TEN_MINUTES = 600
HOUR = 3600
REGISTER_LIMIT = 10  # accounts per IP per hour
LOGIN_IP_LIMIT = 30  # attempts per IP per 10 min (shared NATs exist)
LOGIN_EMAIL_LIMIT = 8  # attempts per account per 10 min
FORGOT_IP_LIMIT = 10
FORGOT_EMAIL_LIMIT = 3  # reset emails per address per hour
RESET_IP_LIMIT = 15


@router.post("/register")
async def register(payload: UserCreate, request: Request, db: AsyncSession = Depends(get_db)):
    await enforce("register", client_ip(request), REGISTER_LIMIT, HOUR)
    service = UserService(db)
    user = await service.register(payload)
    return envelope(data=UserPublic.model_validate(user).model_dump())


@router.post("/login")
async def login(payload: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    # Per IP (spraying many accounts) and per email (hammering one account).
    await enforce("login-ip", client_ip(request), LOGIN_IP_LIMIT, TEN_MINUTES)
    await enforce("login-email", payload.email, LOGIN_EMAIL_LIMIT, TEN_MINUTES)
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


@router.post("/forgot-password")
async def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    await enforce("forgot-ip", client_ip(request), FORGOT_IP_LIMIT, HOUR)
    await enforce("forgot-email", payload.email, FORGOT_EMAIL_LIMIT, HOUR)
    service = UserService(db)
    reset_link = await service.request_password_reset(payload.email)
    data = {"message": "اگر این ایمیل در سیستم ثبت شده باشد، لینک بازیابی رمز عبور برایتان ارسال می‌شود."}
    if reset_link:
        subject, text, html = password_reset_email(reset_link)
        background.add_task(send_email, payload.email, subject, text, html)
        # Local convenience only: never in production, and not once real
        # email is configured.
        if settings.environment != "production" and not email_enabled():
            data["dev_reset_link"] = reset_link
    return envelope(data=data)


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await enforce("reset-ip", client_ip(request), RESET_IP_LIMIT, HOUR)
    service = UserService(db)
    await service.reset_password(payload.token, payload.new_password)
    return envelope(data={"reset": True})
