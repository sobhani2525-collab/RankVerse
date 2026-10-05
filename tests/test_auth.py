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


# --- Email verification ---

def test_email_verification_token_roundtrip():
    from app.core.security import create_email_verification_token

    payload = decode_token(create_email_verification_token("u-1", "a@example.com"))
    assert payload is not None
    assert payload["type"] == "email_verify"
    assert payload["sub"] == "u-1"
    assert payload["email"] == "a@example.com"


async def test_register_starts_unverified_and_link_verifies(client):
    from app.core.security import create_email_verification_token

    res = await client.post(
        "/api/v1/auth/register",
        json={"email": "verify@example.com", "username": "verifyuser", "password": "Sup3rSecret!1"},
    )
    assert res.status_code == 200
    assert res.json()["data"]["email_verified"] is False
    user_id = res.json()["data"]["id"]

    token = create_email_verification_token(user_id, "verify@example.com")
    ok = await client.post("/api/v1/auth/verify-email", json={"token": token})
    assert ok.status_code == 200
    assert ok.json()["data"] == {"verified": True}

    login = await client.post("/api/v1/auth/login", json={"email": "verify@example.com", "password": "Sup3rSecret!1"})
    access = login.json()["data"]["access_token"]
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert me.json()["data"]["email_verified"] is True


async def test_verify_rejects_wrong_type_and_changed_email(client):
    from app.core.security import create_access_token, create_email_verification_token

    res = await client.post(
        "/api/v1/auth/register",
        json={"email": "other@example.com", "username": "otheruser", "password": "Sup3rSecret!1"},
    )
    user_id = res.json()["data"]["id"]

    wrong_type = await client.post("/api/v1/auth/verify-email", json={"token": create_access_token(user_id)})
    assert wrong_type.status_code == 401

    stale = create_email_verification_token(user_id, "old-address@example.com")
    assert (await client.post("/api/v1/auth/verify-email", json={"token": stale})).status_code == 401


# --- Profile (display name / bio / avatar) ---

def test_profile_update_cleans_text_and_rejects_unknown_avatar():
    import pytest
    from pydantic import ValidationError

    from app.modules.users.schemas import ProfileUpdate

    p = ProfileUpdate(display_name="  علی   رضایی \n", bio="  سینما\tدوست  ", avatar_key="a3")
    assert p.display_name == "علی رضایی"
    assert p.bio == "سینما دوست"

    # Blank clears (None) and is still counted as "sent".
    blank = ProfileUpdate(display_name="   ")
    assert blank.display_name is None and "display_name" in blank.model_fields_set
    assert "bio" not in blank.model_fields_set

    with pytest.raises(ValidationError):
        ProfileUpdate(avatar_key="evil.png")
    with pytest.raises(ValidationError):
        ProfileUpdate(bio="x" * 301)


async def test_patch_me_updates_only_sent_fields(client, auth_headers):
    res = await client.patch("/api/v1/users/me", json={"display_name": "نام تست", "avatar_key": "a2"}, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["display_name"] == "نام تست" and data["avatar_key"] == "a2" and data["bio"] is None

    res = await client.patch("/api/v1/users/me", json={"bio": "سلام"}, headers=auth_headers)
    data = res.json()["data"]
    assert data["bio"] == "سلام" and data["display_name"] == "نام تست"  # untouched

    res = await client.patch("/api/v1/users/me", json={"display_name": None}, headers=auth_headers)
    assert res.json()["data"]["display_name"] is None and res.json()["data"]["bio"] == "سلام"

    assert (await client.patch("/api/v1/users/me", json={"avatar_key": "nope"}, headers=auth_headers)).status_code == 422
    assert (await client.patch("/api/v1/users/me", json={"bio": "x"})).status_code == 401
