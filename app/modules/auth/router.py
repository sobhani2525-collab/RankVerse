import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.email import dev_auth_links_enabled, password_reset_email, send_email, verification_email
from app.core.rate_limit import client_ip, enforce
from app.core.schemas import envelope
from app.core.security import create_access_token, decode_token, token_matches_password
from app.core.exceptions import UnauthorizedError
from app.modules.auth.dependencies import get_current_user
from app.modules.users.models import User
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import (
    UserCreate, UserLogin, UserPublic, TokenPair, ForgotPasswordRequest, ResetPasswordRequest, VerifyEmailRequest, ChangePasswordRequest, DeleteAccountRequest,
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
VERIFY_IP_LIMIT = 30
RESEND_VERIFY_LIMIT = 3  # per account per hour
ACCOUNT_SENSITIVE_LIMIT = 5  # password changes / deletion attempts per account per hour


@router.post("/register")
async def register(
    payload: UserCreate,
    request: Request,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    await enforce("register", client_ip(request), REGISTER_LIMIT, HOUR)
    service = UserService(db)
    user = await service.register(payload)
    subject, text, html = verification_email(service.email_verification_link(user))
    background.add_task(send_email, user.email, subject, text, html)
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
async def refresh(refresh_token: str, db: AsyncSession = Depends(get_db)):
    payload = decode_token(refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise UnauthorizedError("Invalid or expired refresh token")
    # A blocked or deleted account must not keep minting access tokens.
    user = await UserRepository(db).get_by_id(uuid.UUID(payload["sub"]))
    if user is None or not user.is_active or user.deleted_at is not None:
        raise UnauthorizedError("Invalid or expired refresh token")
    # A password change or reset ends every session issued for the old password.
    if not token_matches_password(payload, user.hashed_password):
        raise UnauthorizedError("Invalid or expired refresh token")

    new_access = create_access_token(payload["sub"], user.hashed_password)
    return envelope(data={"access_token": new_access, "token_type": "bearer"})


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return envelope(data=UserPublic.model_validate(current_user).model_dump())


@router.post("/verify-email")
async def verify_email(payload: VerifyEmailRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await enforce("verify-ip", client_ip(request), VERIFY_IP_LIMIT, HOUR)
    await UserService(db).verify_email(payload.token)
    return envelope(data={"verified": True})


@router.post("/resend-verification")
async def resend_verification(
    background: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.email_verified_at is not None:
        return envelope(data={"already_verified": True})
    await enforce("resend-verify", str(current_user.id), RESEND_VERIFY_LIMIT, HOUR)
    service = UserService(db)
    link = service.email_verification_link(current_user)
    subject, text, html = verification_email(link)
    background.add_task(send_email, current_user.email, subject, text, html)
    data: dict = {"sent": True}
    if dev_auth_links_enabled():
        data["dev_verify_link"] = link
    return envelope(data=data)


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
        # Local convenience only: explicit opt-in, never once email works.
        if dev_auth_links_enabled():
            data["dev_reset_link"] = reset_link
    return envelope(data=data)


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)):
    await enforce("reset-ip", client_ip(request), RESET_IP_LIMIT, HOUR)
    service = UserService(db)
    await service.reset_password(payload.token, payload.new_password)
    return envelope(data={"reset": True})


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await enforce("change-password", str(current_user.id), ACCOUNT_SENSITIVE_LIMIT, HOUR)
    tokens = await UserService(db).change_password(current_user, payload.current_password, payload.new_password)
    # Every older session just ended; the caller continues on this fresh pair.
    return envelope(data={"changed": True, **tokens.model_dump()})


@router.post("/delete-account")
async def delete_account(
    payload: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await enforce("delete-account", str(current_user.id), ACCOUNT_SENSITIVE_LIMIT, HOUR)
    await UserService(db).delete_account(current_user, payload.password)
    return envelope(data={"deleted": True})
