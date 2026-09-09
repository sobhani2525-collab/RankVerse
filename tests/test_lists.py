"""
Tests for user list creation and the like/follow social actions.
Run with: pytest tests/test_lists.py
"""


async def test_create_list_requires_auth(client):
    res = await client.post("/api/v1/lists", json={"title": "No Auth List"})
    assert res.status_code == 401


async def test_create_list(client, auth_headers):
    res = await client.post(
        "/api/v1/lists",
        headers=auth_headers,
        json={"title": "My Favorite Movies", "description": "a test list", "tags": ["fun"]},
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["slug"].startswith("my-favorite-movies")


async def test_create_list_generates_unique_slugs_on_title_collision(client, auth_headers):
    first = await client.post(
        "/api/v1/lists", headers=auth_headers, json={"title": "Same Title"}
    )
    second = await client.post(
        "/api/v1/lists", headers=auth_headers, json={"title": "Same Title"}
    )
    assert first.json()["data"]["slug"] != second.json()["data"]["slug"]


async def test_toggle_like_flips_state_and_persists(client, auth_headers):
    created = await client.post(
        "/api/v1/lists", headers=auth_headers, json={"title": "Likeable List"}
    )
    slug = created.json()["data"]["slug"]

    liked = await client.post(f"/api/v1/lists/{slug}/like", headers=auth_headers)
    assert liked.status_code == 200
    assert liked.json()["data"]["liked"] is True

    detail = await client.get(f"/api/v1/lists/{slug}", headers=auth_headers)
    assert detail.json()["data"]["is_liked"] is True
    assert detail.json()["data"]["like_count"] == 1

    unliked = await client.post(f"/api/v1/lists/{slug}/like", headers=auth_headers)
    assert unliked.json()["data"]["liked"] is False


async def test_toggle_follow_flips_state_and_persists(client, auth_headers):
    created = await client.post(
        "/api/v1/lists", headers=auth_headers, json={"title": "Followable List"}
    )
    slug = created.json()["data"]["slug"]

    followed = await client.post(f"/api/v1/lists/{slug}/follow", headers=auth_headers)
    assert followed.status_code == 200
    assert followed.json()["data"]["following"] is True

    detail = await client.get(f"/api/v1/lists/{slug}", headers=auth_headers)
    assert detail.json()["data"]["is_following"] is True

    unfollowed = await client.post(f"/api/v1/lists/{slug}/follow", headers=auth_headers)
    assert unfollowed.json()["data"]["following"] is False


async def test_only_owner_can_update_list(client, auth_headers, db_session):
    from app.core.security import create_access_token, hash_password
    from app.modules.users.repository import UserRepository

    created = await client.post(
        "/api/v1/lists", headers=auth_headers, json={"title": "Owner Only List"}
    )
    slug = created.json()["data"]["slug"]

    other_user = await UserRepository(db_session).create(
        email="other@example.com", username="otheruser", hashed_password=hash_password("Sup3rSecret!1")
    )
    await db_session.commit()
    other_headers = {"Authorization": f"Bearer {create_access_token(str(other_user.id))}"}

    res = await client.put(
        f"/api/v1/lists/{slug}", headers=other_headers, json={"title": "Hijacked"}
    )
    assert res.status_code == 401
