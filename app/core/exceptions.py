import logging

from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class RankVerseError(Exception):
    """Base application error. Always caught and wrapped in the standard envelope."""

    def __init__(self, message: str, status_code: int = 400, code: str = "error"):
        self.message = message
        self.status_code = status_code
        self.code = code


class NotFoundError(RankVerseError):
    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, status_code=404, code="not_found")


class AlreadyExistsError(RankVerseError):
    def __init__(self, message: str = "Resource already exists"):
        super().__init__(message, status_code=409, code="already_exists")


class UnauthorizedError(RankVerseError):
    def __init__(self, message: str = "Not authenticated"):
        super().__init__(message, status_code=401, code="unauthorized")


async def rankverse_exception_handler(request: Request, exc: RankVerseError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "data": None,
            "meta": None,
            "error": {"code": exc.code, "message": exc.message},
        },
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "data": None,
            "meta": None,
            "error": {"code": "internal_error", "message": "An unexpected error occurred"},
        },
    )
