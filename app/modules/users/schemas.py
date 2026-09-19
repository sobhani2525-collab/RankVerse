import uuid

from pydantic import BaseModel, EmailStr, ConfigDict, Field


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
    movie_poster_path: str | None = None
