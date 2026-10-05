import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, ConfigDict, Field, field_validator, model_validator


class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: str
    username: str
    email_verified: bool = False
    display_name: str | None = None
    bio: str | None = None
    avatar_key: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _derive_verified(cls, data):
        # Built from the ORM User: expose the flag, not the timestamp.
        if hasattr(data, "email_verified_at"):
            return {
                "id": data.id,
                "email": data.email,
                "username": data.username,
                "email_verified": data.email_verified_at is not None,
                "display_name": data.display_name,
                "bio": data.bio,
                "avatar_key": data.avatar_key,
            }
        return data


# The preset avatars the frontend ships (lib/avatars.ts); keep the two in sync.
PROFILE_AVATAR_KEYS = frozenset(f"a{i}" for i in range(1, 13))


def _clean_text(value: str | None) -> str | None:
    """Collapses whitespace/control characters; empty becomes None (= cleared)."""
    if value is None:
        return None
    cleaned = " ".join("".join(ch if ch.isprintable() or ch in "\n" else " " for ch in value).split())
    return cleaned or None


class ProfileUpdate(BaseModel):
    """PATCH /users/me: only the fields that are sent change; null or blank clears one."""
    display_name: str | None = Field(default=None, max_length=50)
    bio: str | None = Field(default=None, max_length=300)
    avatar_key: str | None = Field(default=None, max_length=20)

    @field_validator("display_name", "bio", mode="before")
    @classmethod
    def _clean(cls, v):
        return _clean_text(v) if isinstance(v, str) else v

    @field_validator("avatar_key")
    @classmethod
    def _known_avatar(cls, v):
        if v is not None and v not in PROFILE_AVATAR_KEYS:
            raise ValueError("Unknown avatar")
        return v


class VerifyEmailRequest(BaseModel):
    token: str


# Deliberately excludes email -- served from a public, unauthenticated
# GET /users/{username} route, unlike UserPublic above which is only ever
# returned to the user themselves (auth/me).
class UserProfilePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    username: str
    created_at: datetime
    display_name: str | None = None
    bio: str | None = None
    avatar_key: str | None = None


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RatingCreate(BaseModel):
    score: int = Field(ge=1, le=5)


class RatingPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    entity_id: uuid.UUID
    score: int
    movie_slug: str | None = None
    movie_title: str | None = None
    movie_title_fa: str | None = None
    movie_poster_path: str | None = None


class FavoritePublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    entity_id: uuid.UUID
    movie_slug: str | None = None
    movie_title: str | None = None
    movie_poster_path: str | None = None
