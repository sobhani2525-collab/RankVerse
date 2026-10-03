"""
Admin list curation (featured / hidden) and the public discovery quality filter.
Run with: pytest tests/test_list_curation.py
"""
import pytest_asyncio

from app.core.security import create_admin_access_token, hash_password
from app.modules.admin.models import AdminAccount
from app.modules.entities.repository import EntityRepository
from app.modules.lists.models import UserList, UserListItem


async def _make_list(db, owner, title, n_items, slug=None):
    repo = EntityRepository(db)
    lst = UserList(user_id=owner.id, title=title, slug=slug or title.replace(" ", "-").lower())
    db.add(lst)
    await db.flush()
    for i in range(n_items):
        movie = await repo.create_entity(
            entity_type="movie", external_id=None, external_source=None,
            title=f"{lst.slug} movie {i}", slug=f"{lst.slug}-movie-{i}", attributes={},
        )
        db.add(UserListItem(
            list_id=lst.id, entity_id=movie.id, entity_type="movie",
            position=i + 1, added_by_user_id=owner.id,
        ))
    await db.commit()
    return lst


@pytest_asyncio.fixture
async def admin_headers(db_session):
    admin = AdminAccount(email="admin@example.com", password_hash=hash_password("Sup3rSecret!1234"))
    db_session.add(admin)
    await db_session.commit()
    return {"Authorization": f"Bearer {create_admin_access_token(str(admin.id))}"}


async def _slugs(client, path="/api/v1/lists"):
    res = await client.get(path)
    assert res.status_code == 200
    return [i["slug"] for i in res.json()["data"]]


async def test_quality_filter_drops_small_and_short_title_lists(client, db_session, test_user):
    await _make_list(db_session, test_user, "Great Movies", 3)
    await _make_list(db_session, test_user, "Tiny List", 2)
    await _make_list(db_session, test_user, "abc", 5)
    slugs = await _slugs(client)
    assert slugs == ["great-movies"]
    assert set(await _slugs(client, "/api/v1/lists?quality_only=false")) == {"great-movies", "tiny-list", "abc"}


async def test_featured_list_bypasses_quality_bar_and_hidden_list_is_dropped(
    client, db_session, test_user, admin_headers
):
    small = await _make_list(db_session, test_user, "Tiny List", 1)
    big = await _make_list(db_session, test_user, "Big List", 4)

    res = await client.patch(
        f"/api/v1/admin/lists/{small.id}", headers=admin_headers, json={"is_featured": True}
    )
    assert res.status_code == 200
    assert res.json()["data"]["is_featured"] is True
    assert "tiny-list" in await _slugs(client)

    res = await client.patch(
        f"/api/v1/admin/lists/{big.id}", headers=admin_headers, json={"is_hidden_from_discovery": True}
    )
    assert res.status_code == 200
    assert "big-list" not in await _slugs(client)
    # Still opens by direct link, and stays out of the sitemap.
    assert (await client.get("/api/v1/lists/big-list")).status_code == 200
    sitemap = await client.get("/api/v1/sitemap/lists")
    assert "big-list" not in [e["slug"] for e in sitemap.json()["data"]]


async def test_featured_endpoint_order_and_reorder(client, db_session, test_user, admin_headers):
    a = await _make_list(db_session, test_user, "List Alpha", 3)
    b = await _make_list(db_session, test_user, "List Bravo", 3)
    for lst in (a, b):
        r = await client.patch(f"/api/v1/admin/lists/{lst.id}", headers=admin_headers, json={"is_featured": True})
        assert r.status_code == 200
    assert await _slugs(client, "/api/v1/lists/featured") == ["list-alpha", "list-bravo"]

    res = await client.post(
        "/api/v1/admin/lists/featured/reorder", headers=admin_headers, json={"ids": [str(b.id), str(a.id)]}
    )
    assert res.status_code == 200
    assert await _slugs(client, "/api/v1/lists/featured") == ["list-bravo", "list-alpha"]

    # Un-featuring clears order/time and drops it from the endpoint.
    r = await client.patch(f"/api/v1/admin/lists/{b.id}", headers=admin_headers, json={"is_featured": False})
    assert r.json()["data"]["featured_order"] is None
    assert await _slugs(client, "/api/v1/lists/featured") == ["list-alpha"]


async def test_admin_lists_table_filters(client, db_session, test_user, admin_headers):
    await _make_list(db_session, test_user, "Table Small", 1)
    await _make_list(db_session, test_user, "Table Large", 5)
    res = await client.get("/api/v1/admin/lists?min_items=3&q=table", headers=admin_headers)
    assert res.status_code == 200
    rows = res.json()["data"]
    assert [r["slug"] for r in rows] == ["table-large"]
    assert rows[0]["item_count"] == 5 and rows[0]["owner_username"] == "tester"


async def test_admin_endpoints_reject_missing_and_user_tokens(client, db_session, test_user, auth_headers):
    lst = await _make_list(db_session, test_user, "Some List", 3)
    for method, path, body in [
        ("get", "/api/v1/admin/lists", None),
        ("patch", f"/api/v1/admin/lists/{lst.id}", {"is_featured": True}),
        ("post", "/api/v1/admin/lists/featured/reorder", {"ids": []}),
    ]:
        for headers in ({}, auth_headers):
            res = await getattr(client, method)(path, headers=headers, **({"json": body} if body else {}))
            assert res.status_code == 401, (method, path)


async def test_admin_can_delete_list(client, db_session, test_user, admin_headers, auth_headers):
    lst = await _make_list(db_session, test_user, "Junk List", 1)
    assert (await client.delete(f"/api/v1/admin/lists/{lst.id}", headers=auth_headers)).status_code == 401
    assert (await client.delete(f"/api/v1/admin/lists/{lst.id}", headers=admin_headers)).status_code == 200
    assert (await client.get("/api/v1/lists/junk-list")).status_code == 404
