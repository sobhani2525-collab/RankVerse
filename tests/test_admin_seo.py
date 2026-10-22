"""
Admin SEO overview (/admin/seo/overview).
Run with: pytest tests/test_admin_seo.py
"""
import pytest
import pytest_asyncio

from app.core.security import create_admin_access_token, hash_password
from app.modules.admin.models import AdminAccount
from app.modules.battles.tournament_models import Battle
from app.modules.entities.models import Entity, RelationshipEdge
from app.modules.lists.models import UserList, UserListItem

URL = "/api/v1/admin/seo/overview"
FA = "خلاصه‌ای به فارسی"


@pytest_asyncio.fixture
async def admin_headers(db_session):
    account = AdminAccount(email="admin@example.com", password_hash=hash_password("Sup3rSecret!1234"))
    db_session.add(account)
    await db_session.commit()
    return {"Authorization": f"Bearer {create_admin_access_token(str(account.id))}"}


@pytest.fixture(autouse=True)
def _no_stats_cache(monkeypatch):
    monkeypatch.setattr("app.config.settings.cache_enabled", False)


async def test_requires_admin_token(client, auth_headers):
    assert (await client.get(URL)).status_code == 401
    assert (await client.get(URL, headers=auth_headers)).status_code == 401


async def test_overview_counts_and_gaps(client, db_session, test_user, admin_headers):
    complete = Entity(entity_type="movie", title="Complete", slug="complete", attributes={
        "title_fa": "کامل", "overview": FA, "overview_source": "tmdb_fa", "poster_path": "/p.jpg",
        "external_vote_count": 9000,
    })
    english = Entity(entity_type="movie", title="English Only", slug="english-only", attributes={
        "title_fa": "انگلیسی", "overview": "An English synopsis.", "overview_source": "en", "poster_path": "/e.jpg",
        "external_vote_count": 500, "year": 2001,
    })
    bare = Entity(entity_type="movie", title="Bare", slug="bare", attributes={"external_vote_count": 800})
    machine = Entity(entity_type="tv_series", title="Show", slug="show", attributes={
        "title_fa": "سریال", "overview": FA, "overview_source": "machine", "poster_path": "/s.jpg",
    })
    credited = Entity(entity_type="person", title="Actor", slug="actor", attributes={"biography": "Born somewhere."})
    uncredited = Entity(entity_type="person", title="Nobody", slug="nobody", attributes={})
    genre = Entity(entity_type="genre", title="Drama", slug="drama")
    db_session.add_all([complete, english, bare, machine, credited, uncredited, genre])
    await db_session.flush()
    full = UserList(user_id=test_user.id, title="Full", slug="full")
    db_session.add_all([
        RelationshipEdge(from_entity_id=complete.id, to_entity_id=credited.id, relation_type="acted_in"),
        full,
        UserList(user_id=test_user.id, title="Empty", slug="empty"),
        UserList(user_id=test_user.id, title="Mine", slug="mine", visibility="private"),
        UserList(user_id=test_user.id, title="Hidden", slug="hidden", is_hidden_from_discovery=True),
        UserList(user_id=test_user.id, title="Later", slug="later", visibility="private", is_watch_later=True),
        Battle(slug="pub00001", title="Pub", entity_type="movie", bracket_size=8, visibility="public", status="active"),
        Battle(slug="unl00001", title="Unl", entity_type="movie", bracket_size=8, visibility="unlisted", status="active"),
        Battle(slug="hid00001", title="Hid", entity_type="movie", bracket_size=8, visibility="public", status="active",
               is_hidden_from_discovery=True),
        Battle(slug="drf00001", title="Drf", entity_type="movie", bracket_size=8),
    ])
    await db_session.flush()
    db_session.add(UserListItem(list_id=full.id, entity_id=complete.id, entity_type="movie",
                                added_by_user_id=test_user.id, position=1))
    await db_session.commit()

    res = await client.get(URL, headers=admin_headers)
    assert res.status_code == 200
    data = res.json()["data"]

    assert data["sitemap"] == {"movie": 3, "tv_series": 1, "person": 1, "genre": 1, "lists": 1}
    assert data["movies"] == {"total": 3, "missing_title_fa": 1, "missing_overview_fa": 2,
                              "machine_overview": 0, "missing_poster": 1}
    assert data["tv_series"]["machine_overview"] == 1 and data["tv_series"]["missing_overview_fa"] == 0
    assert data["people"] == {"total": 2, "without_credits": 1, "missing_biography": 1, "english_biography": 1}
    assert data["lists"] == {"indexable": 1, "empty_public": 2, "hidden": 1, "private": 1}
    assert data["battles"] == {"public": 1, "unlisted": 1, "hidden": 1}

    # Most-voted first; the complete movie and the machine-translated show have no gap.
    assert [(g["slug"], g["missing"]) for g in data["gaps"]] == [
        ("bare", ["title_fa", "overview_fa", "poster"]),
        ("english-only", ["overview_fa"]),
    ]
    assert data["gaps"][1]["year"] == 2001
