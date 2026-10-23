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


def _request(xff: str | None, peer: str | None = "10.1.2.3"):
    from starlette.requests import Request

    headers = [(b"x-forwarded-for", xff.encode())] if xff is not None else []
    scope = {"type": "http", "headers": headers, "client": (peer, 1234) if peer else None}
    return Request(scope)


def test_client_ip_ignores_forged_left_hops():
    # The proxy appends the real caller after whatever the client sent.
    assert rate_limit.client_ip(_request("1.2.3.4, 5.6.7.8, 203.0.113.9")) == "203.0.113.9"
    assert rate_limit.client_ip(_request("garbage, 203.0.113.9, 10.0.0.7")) == "203.0.113.9"


def test_client_ip_skips_internal_proxies():
    assert rate_limit.client_ip(_request("198.51.100.1, 10.0.0.1, 172.20.0.5")) == "198.51.100.1"
    assert rate_limit.client_ip(_request("2001:db8::1, fd00::2")) == "2001:db8::1"
    # No header: the socket peer, even when it's internal (local dev).
    assert rate_limit.client_ip(_request(None, "198.51.100.4")) == "198.51.100.4"
    assert rate_limit.client_ip(_request(None, "127.0.0.1")) == "127.0.0.1"
    assert rate_limit.client_ip(_request(None, None)) == "unknown"


def test_forwarded_ip_is_the_claimed_first_hop():
    assert rate_limit.forwarded_ip(_request("198.51.100.7, 203.0.113.9")) == "198.51.100.7"
    assert rate_limit.forwarded_ip(_request(None, "127.0.0.1")) == "127.0.0.1"


def test_email_disabled_by_default():
    assert email_enabled() is False


def test_password_reset_email_contains_link():
    subject, text, html = password_reset_email("https://example.com/reset-password?token=abc")
    assert "https://example.com/reset-password?token=abc" in text
    assert "https://example.com/reset-password?token=abc" in html
    assert subject


def test_engine_pool_stays_under_the_shared_connection_cap():
    from app.config import settings
    from app.core.database import engine

    assert engine.pool.size() == settings.db_pool_size
    assert engine.pool._max_overflow == settings.db_max_overflow
    # One process must leave most of the DB's 100 connections to everyone else.
    assert settings.db_pool_size + settings.db_max_overflow <= 30


async def test_admin_password_change_limit_holds_without_redis():
    import uuid

    from redis.exceptions import RedisError

    from app.modules.admin.service import PASSWORD_CHANGE_RATE_LIMIT, AdminAuthService

    class BrokenRedis:
        async def incr(self, key):
            raise RedisError("down")

    admin_id = uuid.uuid4()
    for _ in range(PASSWORD_CHANGE_RATE_LIMIT):
        await AdminAuthService._enforce_password_change_rate_limit(BrokenRedis(), admin_id)
    with pytest.raises(RateLimitedError):
        await AdminAuthService._enforce_password_change_rate_limit(BrokenRedis(), admin_id)
    # another admin is unaffected
    await AdminAuthService._enforce_password_change_rate_limit(BrokenRedis(), uuid.uuid4())
