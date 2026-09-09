from fastapi import Header

from app.config import settings
from app.core.exceptions import UnauthorizedError


async def verify_internal_api_key(x_internal_api_key: str | None = Header(default=None)) -> None:
    if not settings.internal_api_key or x_internal_api_key != settings.internal_api_key:
        raise UnauthorizedError("Invalid or missing internal API key")
