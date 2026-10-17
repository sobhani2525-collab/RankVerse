import logging

import sentry_sdk

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


class ForbiddenError(RankVerseError):
    """Authenticated, but not allowed to do this (a bad token is UnauthorizedError)."""

    def __init__(self, message: str = "You don't have permission to do this"):
        super().__init__(message, status_code=403, code="forbidden")


class ValidationError(RankVerseError):
    def __init__(self, message: str = "Invalid request"):
        super().__init__(message, status_code=400, code="validation_error")


class RateLimitedError(RankVerseError):
    def __init__(self, message: str = "Too many attempts, please try again later"):
        super().__init__(message, status_code=429, code="rate_limited")


async def rankverse_exception_handler(request: Request, exc: RankVerseError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "data": None,
            "meta": None,
            "error": {"code": exc.code, "message": exc.message},
        },
    )


def _alert_unhandled(request: Request, exc: Exception) -> None:
    """Turn a 500 into a deduplicated admin alert. Must never raise."""
    try:
        from app.modules.alerts.service import raise_alert_nowait

        route = request.scope.get("route")
        path = getattr(route, "path", request.url.path)
        name = type(exc).__name__
        module = type(exc).__module__ or ""
        if module.startswith(("asyncpg", "sqlalchemy")) and (
            "Connection" in name or "Interface" in name or "Operational" in name or "Timeout" in name
            or "TooManyConnections" in name
        ):
            raise_alert_nowait(
                "critical", "db", "خطای اتصال به دیتابیس / pooler",
                {"error": f"{name}: {str(exc)[:300]}", "path": path}, fingerprint="db:connection",
            )
        elif isinstance(exc, TimeoutError):
            raise_alert_nowait(
                "warning", "timeout", f"Timeout در {request.method} {path}",
                {"error": str(exc)[:300]}, fingerprint=f"timeout:{request.method}:{path}",
            )
        else:
            source = "sync" if request.url.path.startswith("/api/v1/internal/sync") else "http_500"
            raise_alert_nowait(
                "critical" if source == "sync" else "warning", source, f"خطای ۵۰۰ در {request.method} {path}",
                {"error": f"{name}: {str(exc)[:300]}"}, fingerprint=f"{source}:{request.method}:{path}:{name}",
            )
    except Exception:
        logger.warning("could not raise alert for unhandled exception", exc_info=True)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    # This handler swallows the exception, so Sentry's ASGI integration never
    # sees it; report it here (a no-op when Sentry isn't initialised).
    sentry_sdk.capture_exception(exc)
    _alert_unhandled(request, exc)
    return JSONResponse(
        status_code=500,
        content={
            "data": None,
            "meta": None,
            "error": {"code": "internal_error", "message": "An unexpected error occurred"},
        },
    )
