import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, ConfigDict, Field, model_validator


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
            }
        return data


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
