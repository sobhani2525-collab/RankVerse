"""
Deleting comments: authors can remove their own (entity and list comments);
a list's owner can also remove comments on their list; nobody else can.
Run with: TEST_DATABASE_URL=... pytest tests/test_comment_delete.py
"""
import pytest_asyncio

from app.core.security import create_access_token, hash_password
from app.modules.entities.repository import EntityRepository
from app.modules.users.repository import UserRepository


@pytest_asyncio.fixture
async def other_headers(db_session):
    user = await UserRepository(db_session).create(
        email="other@example.com", username="otheruser", hashed_password=hash_password("Sup3rSecret!1")
    )
    await db_session.commit()
    return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}


@pytest_asyncio.fixture
async def movie(db_session):
    entity = await EntityRepository(db_session).create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Comment Target", slug="comment-target", attributes={},
    )
    await db_session.commit()
    return entity


async def _comments(client, entity):
    return (await client.get(f"/api/v1/entities/{entity.id}/comments")).json()["data"]


async def test_author_deletes_own_entity_comment_but_others_cannot(client, auth_headers, other_headers, movie):
    posted = await client.post(f"/api/v1/entities/{movie.id}/comments", headers=auth_headers, json={"body": "hello"})
    cid = posted.json()["data"]["id"]
    url = f"/api/v1/entities/{movie.id}/comments/{cid}"

    assert (await client.delete(url)).status_code == 401  # no token
    assert (await client.delete(url, headers=other_headers)).status_code == 403
    assert len(await _comments(client, movie)) == 1

    assert (await client.delete(url, headers=auth_headers)).status_code == 200
    assert await _comments(client, movie) == []
    assert (await client.delete(url, headers=auth_headers)).status_code == 404  # already gone


async def test_entity_comment_is_scoped_to_its_entity(client, auth_headers, movie, db_session):
    other_movie = await EntityRepository(db_session).create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Elsewhere", slug="elsewhere", attributes={},
    )
    await db_session.commit()
    posted = await client.post(f"/api/v1/entities/{movie.id}/comments", headers=auth_headers, json={"body": "hi"})
    cid = posted.json()["data"]["id"]
    # Right comment id, wrong entity in the URL.
    res = await client.delete(f"/api/v1/entities/{other_movie.id}/comments/{cid}", headers=auth_headers)
    assert res.status_code == 404
    assert len(await _comments(client, movie)) == 1


async def _list_slug(client, headers, title="Comment List"):
    return (await client.post("/api/v1/lists", headers=headers, json={"title": title})).json()["data"]["slug"]


async def _list_comment_count(client, slug):
    return (await client.get(f"/api/v1/lists/{slug}")).json()["data"]["comment_count"]


async def test_list_comment_delete_by_author_and_list_owner(client, auth_headers, other_headers):
    slug = await _list_slug(client, auth_headers)  # owned by test_user

    by_other = (await client.post(f"/api/v1/lists/{slug}/comments", headers=other_headers, json={"body": "nice"})).json()["data"]["id"]
    by_owner = (await client.post(f"/api/v1/lists/{slug}/comments", headers=auth_headers, json={"body": "thanks"})).json()["data"]["id"]
    assert await _list_comment_count(client, slug) == 2

    # A third person can't, but the commenter can.
    stranger = {"Authorization": "Bearer " + create_access_token("00000000-0000-0000-0000-000000000000")}
    assert (await client.delete(f"/api/v1/lists/{slug}/comments/{by_other}", headers=stranger)).status_code in (401, 403)
    assert (await client.delete(f"/api/v1/lists/{slug}/comments/{by_other}", headers=other_headers)).status_code == 200
    assert await _list_comment_count(client, slug) == 1

    # Another user cannot delete the owner's comment...
    assert (await client.delete(f"/api/v1/lists/{slug}/comments/{by_owner}", headers=other_headers)).status_code == 403
    assert await _list_comment_count(client, slug) == 1


async def test_list_owner_can_moderate_and_replies_go_with_the_parent(client, auth_headers, other_headers):
    slug = await _list_slug(client, auth_headers, "Moderated List")
    parent = (await client.post(f"/api/v1/lists/{slug}/comments", headers=other_headers, json={"body": "spam"})).json()["data"]["id"]
    for text in ("reply 1", "reply 2"):
        res = await client.post(
            f"/api/v1/lists/{slug}/comments", headers=auth_headers, json={"body": text, "parent_comment_id": parent}
        )
        assert res.status_code == 200
    assert await _list_comment_count(client, slug) == 3

    # The list's owner deletes someone else's comment; its two replies go too.
    assert (await client.delete(f"/api/v1/lists/{slug}/comments/{parent}", headers=auth_headers)).status_code == 200
    assert await _list_comment_count(client, slug) == 0
    assert (await client.get(f"/api/v1/lists/{slug}/comments")).json()["data"] == []
