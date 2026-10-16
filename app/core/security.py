import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def password_fingerprint(hashed_password: str) -> str:
    """Short keyed digest of the stored password hash. Session tokens carry it (claim
    "pv"), so changing or resetting the password makes every older token stop
    matching: sessions on other devices end without any extra column or table."""
    key = settings.jwt_secret.encode()
    return hmac.new(key, hashed_password.encode(), hashlib.sha256).hexdigest()[:16]


def token_matches_password(payload: dict[str, Any], hashed_password: str) -> bool:
    """False when the token was issued for a different password than the current one.
    Tokens issued before this claim existed carry no "pv" and are still accepted
    (they expire on their own, refresh tokens within refresh_token_expire_days)."""
    pv = payload.get("pv")
    if pv is None:
        return True
    return hmac.compare_digest(str(pv), password_fingerprint(hashed_password))


def _create_token(subject: str, expires_delta: timedelta, token_type: str, extra: dict[str, Any] | None = None) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _session_claims(hashed_password: str | None) -> dict[str, Any] | None:
    return {"pv": password_fingerprint(hashed_password)} if hashed_password else None


def create_access_token(user_id: str, hashed_password: str | None = None) -> str:
    return _create_token(
        user_id,
        timedelta(minutes=settings.access_token_expire_minutes),
        "access",
        _session_claims(hashed_password),
    )


def create_refresh_token(user_id: str, hashed_password: str | None = None) -> str:
    return _create_token(
        user_id,
        timedelta(days=settings.refresh_token_expire_days),
        "refresh",
        _session_claims(hashed_password),
    )


def create_admin_access_token(admin_id: str) -> str:
    return _create_token(
        admin_id,
        timedelta(minutes=settings.admin_access_token_expire_minutes),
        "admin_access",
    )


def create_password_reset_token(user_id: str) -> str:
    return _create_token(
        user_id,
        timedelta(minutes=settings.password_reset_token_expire_minutes),
        "password_reset",
    )


def create_email_verification_token(user_id: str, email: str) -> str:
    """Bound to the address, so changing the email invalidates old links."""
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": user_id,
        "email": email,
        "type": "email_verify",
        "iat": now,
        "exp": now + timedelta(hours=settings.email_verification_token_expire_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
