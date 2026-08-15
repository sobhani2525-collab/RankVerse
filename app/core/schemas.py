from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Meta(BaseModel):
    page: int | None = None
    page_size: int | None = None
    total: int | None = None


class Envelope(BaseModel, Generic[T]):
    data: T
    meta: Meta | None = None
    error: None = None


def envelope(data, meta: Meta | None = None) -> dict:
    """Helper to build a standard {data, meta, error} response dict."""
    return {"data": data, "meta": meta, "error": None}
