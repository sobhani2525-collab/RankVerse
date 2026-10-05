"""
Tests for the auth rate limiter and the transactional-email helpers.
Run with: pytest tests/test_rate_limit.py
"""
import pytest

from app.core import rate_limit
from app.core.email import email_enabled, password_reset_email
from app.core.exceptions import RateLimitedError


async def test_enforce_allows_up_to_limit_then_blocks():
    for _ in range(3):
        await rate_limit.enforce("t-scope", "a@example.com", 3, 60)
    with pytest.raises(RateLimitedError):
        await rate_limit.enforce("t-scope", "a@example.com", 3, 60)


async def test_enforce_counts_identities_and_scopes_separately():
    for _ in range(2):
        await rate_limit.enforce("t-a", "x", 2, 60)
    # Different identity and different scope are unaffected.
    await rate_limit.enforce("t-a", "y", 2, 60)
    await rate_limit.enforce("t-b", "x", 2, 60)
    with pytest.raises(RateLimitedError):
        await rate_limit.enforce("t-a", "x", 2, 60)


async def test_identity_is_case_insensitive():
    await rate_limit.enforce("t-case", "User@Example.com", 1, 60)
    with pytest.raises(RateLimitedError):
        await rate_limit.enforce("t-case", "user@example.com", 1, 60)


async def test_window_expiry_resets_counter(monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(rate_limit.time, "monotonic", lambda: now[0])
    await rate_limit.enforce("t-win", "k", 1, 60)
    with pytest.raises(RateLimitedError):
        await rate_limit.enforce("t-win", "k", 1, 60)
    now[0] += 61
    await rate_limit.enforce("t-win", "k", 1, 60)


def test_email_disabled_by_default():
    assert email_enabled() is False


def test_password_reset_email_contains_link():
    subject, text, html = password_reset_email("https://example.com/reset-password?token=abc")
    assert "https://example.com/reset-password?token=abc" in text
    assert "https://example.com/reset-password?token=abc" in html
    assert subject
