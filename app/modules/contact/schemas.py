import re
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

_BARE_DOMAIN = re.compile(r"^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:[/?#]\S*)?$", re.I)

Category = Literal["bug", "inappropriate", "content_error", "suggestion", "copyright", "other"]


class ContactCreate(BaseModel):
    category: Category
    subject: str = Field(min_length=3, max_length=200)
    message: str = Field(min_length=10, max_length=4000)
    name: str | None = Field(None, max_length=100)
    email: EmailStr | None = None
    page_url: str | None = Field(None, max_length=500)
    # Honeypot: hidden on the form, so only bots fill it in.
    website: str | None = Field(None, max_length=200)

    @field_validator("subject", "message")
    @classmethod
    def _strip_required(cls, v: str, info) -> str:
        # min_length counts padding; the trimmed text must still meet it
        v = v.strip()
        if len(v) < (10 if info.field_name == "message" else 3):
            raise ValueError("too short")
        return v

    @field_validator("name", "page_url", "website", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v

    @field_validator("page_url")
    @classmethod
    def _page_url_scheme(cls, v: str | None) -> str | None:
        # Free text is fine (the admin inbox only links site paths and http(s)
        # URLs); a bare "cinemagozin.ir/movies/x" gets its scheme back.
        if v is not None and _BARE_DOMAIN.match(v):
            return f"https://{v}"
        return v

    @field_validator("email", mode="before")
    @classmethod
    def _blank_email(cls, v):
        if isinstance(v, str):
            return v.strip() or None
        return v


class ContactUpdate(BaseModel):
    status: Literal["new", "reviewed"] | None = None
    admin_note: str | None = Field(None, max_length=1000)
