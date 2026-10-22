"""
Admin curation of battles: featured (ordered), hidden, official, archive, and the
public featured endpoints the hub and the home page use.

Needs Postgres: TEST_DATABASE_URL=... pytest tests/test_admin_battles.py
"""
import uuid

import pytest_asyncio
from sqlalchemy import select

from app.core.security import create_admin_access_token, hash_password
from app.modules.admin.models import AdminAccount, AdminAuditLog
from app.modules.battles.tournament_models import Battle
from app.modules.entities.repository import EntityRepository

URL = "/api/v1/battles"
ADMIN_URL = "/api/v1/admin/battles"


@pytest_asyncio.fixture
async def admin_headers(db_session):
    admin = AdminAccount(email="admin@example.com", password_hash=hash_password("Sup3rSecret!1234"))
    db_session.add(admin)
    await db_session.commit()
    return {"Authorization": f"Bearer {create_admin_access_token(str(admin.id))}"}


async def _entities(db, n):
    repo = EntityRepository(db)
    out = [
        await repo.create_entity(
            entity_type="movie", external_id=None, external_source=None,
            title=f"t{i}", slug=f"t{i}-{uuid.uuid4().hex[:6]}", attributes={"title_fa": f"ف{i}"},
        )
        for i in range(n)
    ]
    await db.commit()
    return out


async def _pool(client, headers, entities, title="نبرد آزمایشی"):
    slug = (await client.post(URL, json={"title": title, "entity_type": "movie", "bracket_size": 4}, headers=headers)).json()["data"]["slug"]
    await client.put(f"{URL}/{slug}/entries", json={"entity_ids": [str(e.id) for e in entities]}, headers=headers)
    r = await client.post(f"{URL}/{slug}/publish", json={}, headers=headers)
    assert r.status_code == 200, r.text
    return slug


async def _battle_id(db, slug):
    return (await db.execute(select(Battle.id).where(Battle.slug == slug))).scalar_one()


async def test_admin_endpoints_need_an_admin(client, auth_headers):
    assert (await client.get(ADMIN_URL)).status_code == 401
    assert (await client.get(ADMIN_URL, headers=auth_headers)).status_code in (401, 403)  # a normal user is not an admin


async def test_feature_order_and_unfeature(client, db_session, auth_headers, admin_headers):
    entities = await _entities(db_session, 4)
    first = await _pool(client, auth_headers, entities, "اول")
    second = await _pool(client, auth_headers, entities, "دوم")
    ids = {s: str(await _battle_id(db_session, s)) for s in (first, second)}

    assert (await client.get(f"{URL}/featured")).json()["data"] == []
    for slug in (first, second):
        r = await client.patch(f"{ADMIN_URL}/{ids[slug]}", json={"is_featured": True}, headers=admin_headers)
        assert r.status_code == 200 and r.json()["data"]["is_featured"] is True
    assert [b["slug"] for b in (await client.get(f"{URL}/featured")).json()["data"]] == [first, second]

    r = await client.post(f"{ADMIN_URL}/featured/reorder", json={"ids": [ids[second], ids[first]]}, headers=admin_headers)
    assert [b["slug"] for b in r.json()["data"]] == [second, first]
    assert [b["slug"] for b in (await client.get(f"{URL}/featured")).json()["data"]] == [second, first]
    assert [b["slug"] for b in (await client.get(f"{ADMIN_URL}/featured", headers=admin_headers)).json()["data"]] == [second, first]

    await client.patch(f"{ADMIN_URL}/{ids[second]}", json={"is_featured": False}, headers=admin_headers)
    assert [b["slug"] for b in (await client.get(f"{URL}/featured")).json()["data"]] == [first]
    actions = [a for a in (await db_session.execute(select(AdminAuditLog.action))).scalars()]
    assert "battle.update" in actions and "battle.featured_reorder" in actions


async def test_only_public_active_pool_battles_can_be_featured(client, db_session, auth_headers, admin_headers):
    entities = await _entities(db_session, 4)
    draft = (await client.post(URL, json={"title": "پیش‌نویس", "entity_type": "movie", "bracket_size": 4}, headers=auth_headers)).json()["data"]["slug"]
    r = await client.patch(f"{ADMIN_URL}/{await _battle_id(db_session, draft)}", json={"is_featured": True}, headers=admin_headers)
    assert r.status_code == 404  # drafts are invisible to curation

    slug = await _pool(client, auth_headers, entities)
    battle_id = await _battle_id(db_session, slug)
    await client.delete(f"{ADMIN_URL}/{battle_id}", headers=admin_headers)  # archived
    r = await client.patch(f"{ADMIN_URL}/{battle_id}", json={"is_featured": True}, headers=admin_headers)
    assert r.status_code == 400


async def test_hidden_battles_leave_public_listings_but_keep_their_link(client, db_session, auth_headers, admin_headers):
    entities = await _entities(db_session, 4)
    slug = await _pool(client, auth_headers, entities)
    battle_id = await _battle_id(db_session, slug)
    await client.patch(f"{ADMIN_URL}/{battle_id}", json={"is_featured": True}, headers=admin_headers)
    assert [b["slug"] for b in (await client.get(URL)).json()["data"]] == [slug]

    await client.patch(f"{ADMIN_URL}/{battle_id}", json={"is_hidden_from_discovery": True}, headers=admin_headers)
    assert (await client.get(URL)).json()["data"] == []
    assert (await client.get(f"{URL}/featured")).json()["data"] == []
    assert (await client.get(f"{URL}/{slug}")).status_code == 200  # the direct link still works
    rows = (await client.get(ADMIN_URL, params={"hidden": "true"}, headers=admin_headers)).json()["data"]
    assert [r["slug"] for r in rows] == [slug]


async def test_official_flag_note_and_archive(client, db_session, auth_headers, admin_headers):
    entities = await _entities(db_session, 4)
    slug = await _pool(client, auth_headers, entities)
    battle_id = await _battle_id(db_session, slug)

    r = await client.patch(f"{ADMIN_URL}/{battle_id}", json={"is_official": True, "curation_note": "  خوب  "}, headers=admin_headers)
    data = r.json()["data"]
    assert data["is_official"] is True and data["curation_note"] == "خوب"
    assert data["creator_username"] == "tester" and data["follower_count"] == 1

    r = await client.delete(f"{ADMIN_URL}/{battle_id}", headers=admin_headers)
    assert r.json()["data"]["status"] == "archived"
    assert (await client.get(URL)).json()["data"] == []
    assert (await client.get(f"{URL}/{slug}")).status_code == 200


async def test_featured_random_returns_a_playable_battle(client, db_session, auth_headers, admin_headers):
    assert (await client.get(f"{URL}/featured/random")).json()["data"] is None

    entities = await _entities(db_session, 4)
    first = await _pool(client, auth_headers, entities, "اول")
    second = await _pool(client, auth_headers, entities, "دوم")
    for slug in (first, second):
        await client.patch(f"{ADMIN_URL}/{await _battle_id(db_session, slug)}", json={"is_featured": True}, headers=admin_headers)

    seen = set()
    for _ in range(12):
        data = (await client.get(f"{URL}/featured/random")).json()["data"]
        assert len(data["participants"]) == 4 and data["mode"] == "pool"
        seen.add(data["slug"])
    assert seen == {first, second}
    # asking for "another one" avoids the slug just played
    assert (await client.get(f"{URL}/featured/random", params={"exclude": first})).json()["data"]["slug"] == second
