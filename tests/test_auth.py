"""
Tests for registration, login, and JWT handling.
Run with: pytest tests/test_auth.py
"""
from app.core.security import create_access_token, create_refresh_token, decode_token


# --- Pure JWT tests (no DB required) ---

def test_access_token_roundtrip():
    token = create_access_token("11111111-1111-1111-1111-111111111111")
    payload = decode_token(token)
    assert payload is not None
    assert payload["sub"] == "11111111-1111-1111-1111-111111111111"
    assert payload["type"] == "access"


def test_refresh_token_has_refresh_type():
    token = create_refresh_token("11111111-1111-1111-1111-111111111111")
    payload = decode_token(token)
    assert payload is not None
    assert payload["type"] == "refresh"


def test_decode_garbage_token_returns_none():
    assert decode_token("not-a-real-jwt") is None


# --- Register / login / me (integration, hits the real endpoints) ---

async def test_register_creates_user(client):
    res = await client.post(
        "/api/v1/auth/register",
        json={"email": "new@example.com", "username": "newuser", "password": "Sup3rSecret!1"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["error"] is None
    assert body["data"]["email"] == "new@example.com"
    assert body["data"]["username"] == "newuser"


async def test_register_duplicate_email_is_rejected(client):
    payload = {"email": "dupe@example.com", "username": "dupeuser", "password": "Sup3rSecret!1"}
    first = await client.post("/api/v1/auth/register", json=payload)
    assert first.status_code == 200

    second = await client.post(
        "/api/v1/auth/register",
        json={**payload, "username": "someoneelse"},
    )
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "already_exists"


async def test_login_success_returns_token_pair(client):
    await client.post(
        "/api/v1/auth/register",
        json={"email": "login@example.com", "username": "loginuser", "password": "Sup3rSecret!1"},
    )

    res = await client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "Sup3rSecret!1"},
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["access_token"]
    assert data["refresh_token"]
    assert decode_token(data["access_token"])["type"] == "access"


async def test_login_wrong_password_is_rejected(client):
    await client.post(
        "/api/v1/auth/register",
        json={"email": "wrongpass@example.com", "username": "wrongpassuser", "password": "Sup3rSecret!1"},
    )

    res = await client.post(
        "/api/v1/auth/login",
        json={"email": "wrongpass@example.com", "password": "not-the-password"},
    )
    assert res.status_code == 401


async def test_me_without_token_is_rejected(client):
    res = await client.get("/api/v1/auth/me")
    assert res.status_code == 401


async def test_me_with_valid_token_returns_current_user(client, test_user, auth_headers):
    res = await client.get("/api/v1/auth/me", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["data"]["email"] == test_user.email
