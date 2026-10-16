"""
Where-to-watch links: URL validation, admin upsert/import/delete, the public
detail payload and the counted click-through redirect.
Run with: pytest tests/test_watch_links.py
"""
import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.exceptions import ValidationError
from app.core.security import create_admin_access_token, hash_password
from app.modules.admin.models import AdminAccount, AdminAuditLog
from app.modules.entities.repository import EntityRepository
from app.modules.watch.models import WatchLink
from app.modules.watch.providers import validate_link

ADMIN = "/api/v1/admin/watch-links"


# --- Pure validation (no DB) ---

def test_accepts_provider_domain_and_subdomain():
    assert validate_link("namava", "https://www.namava.ir/movie/1", "subscription") == "https://www.namava.ir/movie/1"
    assert validate_link("telewebion", "https://telewebion.ir/x", "free")


@pytest.mark.parametrize(
    "provider,url",
    [
        ("namava", "http://www.namava.ir/movie/1"),          # not https
        ("namava", "https://evil.example/namava.ir"),        # wrong host
        ("namava", "https://namava.ir.evil.example/x"),      # look-alike host
        ("namava", "https://notnamava.ir/x"),                # suffix without a dot boundary
        ("namava", "https://user:pw@namava.ir/x"),           # credentials in the URL
        ("filimo", "https://www.namava.ir/movie/1"),         # right site, wrong provider
        ("netflix", "https://netflix.com/title/1"),          # unsupported provider
        ("filimo", ""),
    ],
)
def test_rejects_unsafe_or_mismatched_urls(provider, url):
    with pytest.raises(ValidationError):
        validate_link(provider, url, "subscription")


def test_rejects_unknown_access_type():
    with pytest.raises(ValidationError):
        validate_link("filimo", "https://www.filimo.com/m/1", "barter")


# --- API (integration) ---

@pytest_asyncio.fixture
async def admin_headers(db_session):
    account = AdminAccount(email="watch-admin@example.com", password_hash=hash_password("Adm1nSecret!x"))
    db_session.add(account)
    await db_session.commit()
    return {"Authorization": f"Bearer {create_admin_access_token(str(account.id))}"}


@pytest_asyncio.fixture
async def movie(db_session):
    entity = await EntityRepository(db_session).create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Watchable Movie", slug="watchable-movie", attributes={"year": 2001},
    )
    await db_session.commit()
    return entity


async def test_admin_endpoints_require_admin(client, movie):
    assert (await client.get(ADMIN)).status_code == 401
    res = await client.put(ADMIN, json={"entity_id": str(movie.id), "provider": "filimo", "url": "https://www.filimo.com/m/1"})
    assert res.status_code == 401


async def test_upsert_then_update_keeps_one_link_per_provider(client, db_session, admin_headers, movie):
    body = {"entity_id": str(movie.id), "provider": "filimo", "url": "https://www.filimo.com/m/1", "access_type": "subscription"}
    first = await client.put(ADMIN, json=body, headers=admin_headers)
    assert first.status_code == 200, first.text
    again = await client.put(ADMIN, json={**body, "url": "https://www.filimo.com/m/2", "is_affiliate": True}, headers=admin_headers)
    assert again.status_code == 200
    assert again.json()["data"]["id"] == first.json()["data"]["id"]

    rows = (await db_session.execute(select(WatchLink))).scalars().all()
    assert len(rows) == 1
    assert rows[0].url.endswith("/m/2") and rows[0].is_affiliate is True

    actions = (await db_session.execute(select(AdminAuditLog.action))).scalars().all()
    assert "watch_link.set" in actions and "watch_link.update" in actions


async def test_upsert_rejects_wrong_domain(client, admin_headers, movie):
    res = await client.put(
        ADMIN,
        json={"entity_id": str(movie.id), "provider": "filimo", "url": "https://evil.example/x"},
        headers=admin_headers,
    )
    assert res.status_code == 400


async def test_import_reports_each_row_and_applies_the_good_ones(client, db_session, admin_headers, movie):
    rows = [
        {"entity_slug": "watchable-movie", "provider": "namava", "url": "https://www.namava.ir/movie/9"},
        {"entity_slug": "no-such-movie", "provider": "namava", "url": "https://www.namava.ir/movie/9"},
        {"entity_slug": "watchable-movie", "provider": "filmnet", "url": "https://evil.example/x"},
    ]
    res = await client.post(f"{ADMIN}/import", json={"rows": rows}, headers=admin_headers)
    assert res.status_code == 200
    results = res.json()["data"]
    assert [r["ok"] for r in results] == [True, False, False]
    assert [r["row"] for r in results] == [1, 2, 3]

    stored = (await db_session.execute(select(WatchLink))).scalars().all()
    assert [(l.provider, l.source) for l in stored] == [("namava", "import")]


async def test_movie_detail_lists_links_in_provider_order_without_urls(client, admin_headers, movie):
    for provider, url in (("filmnet", "https://filmnet.ir/m/1"), ("filimo", "https://www.filimo.com/m/1")):
        await client.put(ADMIN, json={"entity_id": str(movie.id), "provider": provider, "url": url}, headers=admin_headers)

    detail = (await client.get("/api/v1/movies/watchable-movie")).json()["data"]
    assert [l["provider"] for l in detail["watch_links"]] == ["filimo", "filmnet"]
    assert detail["watch_links"][0]["provider_name"] == "فیلیمو"
    assert all("url" not in l for l in detail["watch_links"])


async def test_click_redirects_to_the_service_and_counts(client, db_session, admin_headers, movie):
    created = await client.put(
        ADMIN, json={"entity_id": str(movie.id), "provider": "namava", "url": "https://www.namava.ir/movie/1"}, headers=admin_headers
    )
    link_id = created.json()["data"]["id"]

    res = await client.get(f"/api/v1/watch-links/{link_id}/go", follow_redirects=False)
    assert res.status_code == 302
    assert res.headers["location"] == "https://www.namava.ir/movie/1"
    assert "noindex" in res.headers["x-robots-tag"]

    db_session.expire_all()
    link = (await db_session.execute(select(WatchLink))).scalar_one()
    assert link.click_count == 1


async def test_click_on_unknown_link_is_404(client):
    res = await client.get("/api/v1/watch-links/00000000-0000-0000-0000-000000000000/go", follow_redirects=False)
    assert res.status_code == 404


async def test_delete_removes_the_link(client, db_session, admin_headers, movie):
    created = await client.put(
        ADMIN, json={"entity_id": str(movie.id), "provider": "filimo", "url": "https://www.filimo.com/m/1"}, headers=admin_headers
    )
    res = await client.delete(f"{ADMIN}/{created.json()['data']['id']}", headers=admin_headers)
    assert res.status_code == 200
    assert (await db_session.execute(select(WatchLink))).scalars().all() == []


async def test_admin_entity_search_matches_the_persian_title(client, db_session, admin_headers):
    # Titles are stored in their original language; the Persian name is in attributes.
    await EntityRepository(db_session).create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Life Is Beautiful", slug="life-is-beautiful-1997", attributes={"title_fa": "زندگی زیباست", "year": 1997},
    )
    await db_session.commit()

    by_persian = await client.get(f"{ADMIN}/entities", params={"q": "زندگی"}, headers=admin_headers)
    assert by_persian.status_code == 200
    hits = by_persian.json()["data"]
    assert [h["slug"] for h in hits] == ["life-is-beautiful-1997"]
    assert hits[0]["title_fa"] == "زندگی زیباست"

    by_original = await client.get(f"{ADMIN}/entities", params={"q": "beautiful"}, headers=admin_headers)
    assert [h["slug"] for h in by_original.json()["data"]] == ["life-is-beautiful-1997"]
