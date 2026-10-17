import time

from app.config import settings
from app.modules.alerts.service import raise_alert_nowait


class SlowRequestMiddleware:
    """Pure ASGI (no BaseHTTPMiddleware overhead): raises a warning when a
    watched GET path takes longer than ALERT_SLOW_REQUEST_SECONDS."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") != "GET":
            return await self.app(scope, receive, send)
        prefixes = tuple(p.strip() for p in settings.alert_slow_paths.split(",") if p.strip())
        path = scope.get("path", "")
        if not prefixes or not path.startswith(prefixes):
            return await self.app(scope, receive, send)
        started = time.monotonic()
        try:
            await self.app(scope, receive, send)
        finally:
            elapsed = time.monotonic() - started
            if elapsed >= settings.alert_slow_request_seconds:
                route = scope.get("route")
                template = getattr(route, "path", path)
                raise_alert_nowait(
                    "warning", "slow_request", f"درخواست کند: {template}",
                    {"path": path, "seconds": round(elapsed, 2)}, fingerprint=f"slow:{template}",
                )
