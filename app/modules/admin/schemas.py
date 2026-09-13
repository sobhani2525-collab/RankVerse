import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, ConfigDict, Field


class AdminLogin(BaseModel):
    email: EmailStr
    password: str


class AdminPasswordChange(BaseModel):
    current_password: str
    # NIST 800-63B: length matters more than composition rules, so this is
    # the only client-independent constraint enforced here.
    new_password: str = Field(min_length=12)


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
