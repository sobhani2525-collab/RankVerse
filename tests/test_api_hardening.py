"""
API docs stay off unless enabled, and every response carries the security headers.
Run with: pytest tests/test_api_hardening.py
"""
import httpx

from app.config import settings
from app.main import app


async def _get(path: str) -> httpx.Response:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
        return await ac.get(path)


def test_docs_are_off_by_default():
    assert settings.model_fields["api_docs_enabled"].default is False
    if not settings.api_docs_enabled:
        assert app.docs_url is None and app.redoc_url is None and app.openapi_url is None


async def test_docs_routes_404_when_disabled():
    if settings.api_docs_enabled:
        return
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert (await _get(path)).status_code == 404


async def test_security_headers_on_every_response():
    for path in ("/health", "/no-such-route"):
        res = await _get(path)
        assert res.headers["x-content-type-options"] == "nosniff"
        assert res.headers["x-frame-options"] == "DENY"
        assert res.headers["referrer-policy"] == "no-referrer"
        assert res.headers["strict-transport-security"].startswith("max-age=")
