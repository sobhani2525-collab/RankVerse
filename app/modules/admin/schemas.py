import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, ConfigDict


class AdminLogin(BaseModel):
    email: EmailStr
    password: str


class AdminPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: str
    role: str
    last_login_at: datetime | None = None


class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin: AdminPublic
