"""
Unit tests for the internal sync API key dependency (no DB required).
Run with: pytest tests/test_sync_dependencies.py
"""
import pytest

from app.config import settings
from app.core.exceptions import UnauthorizedError
from app.modules.sync.dependencies import verify_internal_api_key


async def test_valid_key_is_accepted(monkeypatch):
    monkeypatch.setattr(settings, "internal_api_key", "correct-horse-battery-staple")
    await verify_internal_api_key(x_internal_api_key="correct-horse-battery-staple")


async def test_missing_header_is_rejected(monkeypatch):
    monkeypatch.setattr(settings, "internal_api_key", "correct-horse-battery-staple")
    with pytest.raises(UnauthorizedError):
        await verify_internal_api_key(x_internal_api_key=None)


async def test_wrong_key_is_rejected(monkeypatch):
    monkeypatch.setattr(settings, "internal_api_key", "correct-horse-battery-staple")
    with pytest.raises(UnauthorizedError):
        await verify_internal_api_key(x_internal_api_key="wrong-key")


async def test_unset_internal_api_key_rejects_everything(monkeypatch):
    # Fail-closed: an unconfigured key must never act as an "open" gate,
    # even if a caller happens to send a matching empty string.
    monkeypatch.setattr(settings, "internal_api_key", "")
    with pytest.raises(UnauthorizedError):
        await verify_internal_api_key(x_internal_api_key="")
    with pytest.raises(UnauthorizedError):
        await verify_internal_api_key(x_internal_api_key=None)
