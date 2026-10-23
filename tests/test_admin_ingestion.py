"""
Admin ingestion page (/admin/ingestion): catalog freshness and hand-run TMDb syncs.
TMDb itself is never called: SyncService is patched.
Run with: pytest tests/test_admin_ingestion.py
"""
from datetime import timedelta

import httpx
import pytest_asyncio
from sqlalchemy import select

from app.core.security import create_admin_access_token, hash_password
from app.modules.admin.models import AdminAccount, AdminAuditLog
from app.modules.daily_battle.tehran import utcnow
from app.modules.entities.models import Entity
from app.modules.sync.service import SyncService

BASE = "/api/v1/admin/ingestion"


@pytest_asyncio.fixture
async def admin_headers(db_session):
    account = AdminAccount(email="admin@example.com", password_hash=hash_password("Sup3rSecret!1234"))
    db_session.add(account)
    await db_session.commit()
    return {"Authorization": f"Bearer {create_admin_access_token(str(account.id))}"}


async def test_requires_admin_token(client, auth_headers):
    for method, path in (("get", "/overview"), ("get", "/tmdb-check"), ("post", "/sync")):
        assert (await getattr(client, method)(f"{BASE}{path}")).status_code == 401
    assert (await client.get(f"{BASE}/overview", headers=auth_headers)).status_code == 401


async def test_overview(client, db_session, admin_headers):
    now = utcnow()
    old = now - timedelta(days=400)
    db_session.add_all([
        Entity(entity_type="movie", title="New", slug="new", external_source="tmdb", external_id="1",
               attributes={"imdb_id": "tt1", "imdb_rating": 7.5, "overview_source": "tmdb_fa",
                           "external_vote_count": 5000}),
        Entity(entity_type="movie", title="Old", slug="old", external_source="tmdb", external_id="2",
               attributes={"overview_source": "machine", "external_vote_count": 9000},
               created_at=old, updated_at=old),
        Entity(entity_type="movie", title="Manual", slug="manual", attributes={}),
        Entity(entity_type="person", title="P", slug="p", external_source="tmdb_person", external_id="9",
               attributes={"biography_source": "en"}),
    ])
    await db_session.commit()

    res = await client.get(f"{BASE}/overview", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()["data"]
    movie = next(t for t in data["types"] if t["entity_type"] == "movie")
    assert movie["total"] == 3 and movie["added_7d"] == 2 and movie["unchanged_180d"] == 1
    assert movie["sources"] == {"tmdb": 2, "none": 1}
    cov = next(c for c in data["coverage"] if c["entity_type"] == "movie")
    assert cov["with_imdb_id"] == 1 and cov["with_imdb_rating"] == 1
    assert cov["overview_sources"] == {"tmdb_fa": 1, "machine": 1, "none": 1}
    assert data["biography_sources"] == {"en": 1}
    assert data["recent"][-1]["slug"] == "old"
    # Popular TMDb titles untouched the longest come first.
    assert [t["slug"] for t in data["stale"]] == ["old", "new"]
    assert data["stale"][0]["tmdb_id"] == "2"


async def test_tmdb_check_without_key(client, admin_headers, monkeypatch):
    monkeypatch.setattr("app.config.settings.tmdb_api_key", "")
    data = (await client.get(f"{BASE}/tmdb-check", headers=admin_headers)).json()["data"]
    assert data["ok"] is False and "TMDB_API_KEY" in data["message"]


async def test_sync_without_key_does_not_call_tmdb(client, admin_headers, monkeypatch):
    monkeypatch.setattr("app.config.settings.tmdb_api_key", "")
    res = await client.post(f"{BASE}/sync", headers=admin_headers, json={"entity_type": "movie", "tmdb_id": 550})
    assert res.status_code == 503 and "TMDB_API_KEY" in res.json()["error"]["message"]


async def test_sync_creates_then_refreshes_and_audits(client, db_session, admin_headers, monkeypatch):
    monkeypatch.setattr("app.config.settings.tmdb_api_key", "test-key")
    async def fake_sync_movie(self, tmdb_id, accept=None):
        entity = (await self.db.execute(select(Entity).where(Entity.external_id == str(tmdb_id)))).scalar_one_or_none()
        if entity is None:
            entity = Entity(entity_type="movie", title="Synced", slug="synced", external_source="tmdb",
                            external_id=str(tmdb_id), attributes={})
            self.db.add(entity)
        await self.db.commit()
        return {"id": str(entity.id), "slug": entity.slug, "title": entity.title}

    monkeypatch.setattr(SyncService, "sync_movie", fake_sync_movie)

    first = await client.post(f"{BASE}/sync", headers=admin_headers, json={"entity_type": "movie", "tmdb_id": 550})
    assert first.status_code == 200
    assert first.json()["data"]["created"] is True and first.json()["data"]["slug"] == "synced"
    second = await client.post(f"{BASE}/sync", headers=admin_headers, json={"entity_type": "movie", "tmdb_id": 550})
    assert second.json()["data"]["created"] is False

    logs = (await db_session.execute(select(AdminAuditLog).where(AdminAuditLog.action == "ingestion.sync"))).scalars().all()
    assert [log.after["created"] for log in sorted(logs, key=lambda r: r.created_at)] == [True, False]

    runs = (await client.get(f"{BASE}/overview", headers=admin_headers)).json()["data"]["runs"]
    assert len(runs) == 2 and runs[0]["after"]["tmdb_id"] == 550


async def test_sync_reports_tmdb_errors(client, admin_headers, monkeypatch):
    monkeypatch.setattr("app.config.settings.tmdb_api_key", "test-key")
    def raising(status):
        async def fake(self, tmdb_id, accept=None):
            req = httpx.Request("GET", "https://api.themoviedb.org/3/tv/1")
            raise httpx.HTTPStatusError("x", request=req, response=httpx.Response(status, request=req))
        return fake

    monkeypatch.setattr(SyncService, "sync_tv_series", raising(404))
    res = await client.post(f"{BASE}/sync", headers=admin_headers, json={"entity_type": "tv_series", "tmdb_id": 1})
    assert res.status_code == 404

    monkeypatch.setattr(SyncService, "sync_tv_series", raising(503))
    res = await client.post(f"{BASE}/sync", headers=admin_headers, json={"entity_type": "tv_series", "tmdb_id": 1})
    assert res.status_code == 502

    res = await client.post(f"{BASE}/sync", headers=admin_headers, json={"entity_type": "track", "tmdb_id": 1})
    assert res.status_code in (400, 422)
