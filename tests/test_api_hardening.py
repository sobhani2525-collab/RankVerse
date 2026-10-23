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


async def test_reset_link_never_returned_without_opt_in(client, test_user, monkeypatch):
    # The production case: ENVIRONMENT unset (defaults to development).
    monkeypatch.setattr(settings, "environment", "development")
    for provider in ("log", "SMTP-typo"):
        monkeypatch.setattr(settings, "email_provider", provider)
        res = await client.post("/api/v1/auth/forgot-password", json={"email": test_user.email})
        assert res.status_code == 200
        assert "dev_reset_link" not in res.json()["data"]


async def test_reset_link_returned_only_with_opt_in_and_no_email(client, test_user, monkeypatch):
    monkeypatch.setattr(settings, "dev_auth_links", True)
    res = await client.post("/api/v1/auth/forgot-password", json={"email": test_user.email})
    assert "reset-password?token=" in res.json()["data"]["dev_reset_link"]

    monkeypatch.setattr(settings, "email_provider", "SMTP")
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "email_from", "no-reply@example.com")
    async def _no_send(*args, **kwargs):
        return True

    monkeypatch.setattr("app.modules.auth.router.send_email", _no_send)
    res = await client.post("/api/v1/auth/forgot-password", json={"email": test_user.email})
    assert "dev_reset_link" not in res.json()["data"]


async def test_security_headers_on_every_response():
    for path in ("/health", "/no-such-route"):
        res = await _get(path)
        assert res.headers["x-content-type-options"] == "nosniff"
        assert res.headers["x-frame-options"] == "DENY"
        assert res.headers["referrer-policy"] == "no-referrer"
        assert res.headers["strict-transport-security"].startswith("max-age=")
