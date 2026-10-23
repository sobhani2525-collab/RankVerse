"""
Admin algorithms page (/admin/algorithms): parameters, ranking health,
"why this score?", drift check and recompute.
Run with: pytest tests/test_admin_algorithms.py
"""
import uuid

import pytest_asyncio
from sqlalchemy import select

from app.core.security import create_admin_access_token, hash_password
from app.modules.admin.models import AdminAccount, AdminAuditLog
from app.modules.battles.models import EntityEloScore
from app.modules.entities.models import Entity, EntityRanking
from app.modules.ranking.service import RankingService
from app.modules.users.models import UserRating

BASE = "/api/v1/admin/algorithms"


@pytest_asyncio.fixture
async def admin_headers(db_session):
    account = AdminAccount(email="admin@example.com", password_hash=hash_password("Sup3rSecret!1234"))
    db_session.add(account)
    await db_session.commit()
    return {"Authorization": f"Bearer {create_admin_access_token(str(account.id))}"}


@pytest_asyncio.fixture
async def titles(db_session, test_user):
    rated = Entity(entity_type="movie", title="Rated", slug="rated", attributes={
        "imdb_rating": 8.4, "imdb_votes": 120000, "external_vote_count": 9000, "title_fa": "امتیازدار", "year": 1999,
    })
    tmdb_only = Entity(entity_type="movie", title="Tmdb Only", slug="tmdb-only", attributes={
        "external_rating": 7.0, "external_vote_count": 300,
    })
    bare = Entity(entity_type="tv_series", title="Bare Show", slug="bare-show", attributes={})
    db_session.add_all([rated, tmdb_only, bare])
    await db_session.flush()
    db_session.add_all([
        UserRating(user_id=test_user.id, entity_id=rated.id, score=5),
        EntityEloScore(entity_id=rated.id, category="movie", elo_score=1400.0, matches_played=30),
    ])
    await db_session.flush()
    await RankingService(db_session).recompute_entities([rated, tmdb_only, bare])
    await db_session.commit()
    return rated, tmdb_only, bare


async def test_requires_admin_token(client, auth_headers):
    for path in ("/params", "/health", "/drift", "/titles?q=a"):
        assert (await client.get(f"{BASE}{path}")).status_code == 401
    assert (await client.get(f"{BASE}/health", headers=auth_headers)).status_code == 401
    assert (await client.post(f"{BASE}/recompute", json={"entity_ids": []})).status_code == 401


async def test_params_show_runtime_values(client, admin_headers, monkeypatch):
    monkeypatch.setattr("app.config.settings.ranking_min_votes", 77)
    params = (await client.get(f"{BASE}/params", headers=admin_headers)).json()["data"]
    by_key = {p["key"]: p for p in params}
    assert by_key["ranking_min_votes"] == {"group": "ranking", "key": "ranking_min_votes", "env": "RANKING_MIN_VOTES", "value": 77}
    assert by_key["K_FACTOR_PROVISIONAL"]["env"] is None and by_key["K_FACTOR_PROVISIONAL"]["group"] == "elo"
    assert {p["group"] for p in params} == {"ranking", "taste", "lists", "daily_battle", "elo"}


async def test_explain_matches_the_stored_score(client, admin_headers, titles):
    rated, tmdb_only, bare = titles
    data = (await client.get(f"{BASE}/explain/{rated.id}", headers=admin_headers)).json()["data"]
    b = data["breakdown"]
    assert data["title"]["title_fa"] == "امتیازدار" and data["title"]["year"] == 1999
    assert b["final"] == data["stored_score"]
    assert b["external_source"] == "imdb" and b["external_votes"] == 120000
    assert b["user_votes"] == 1 and b["user_avg"] == 5.0
    assert b["matches"] == 30 and b["battle_adjustment"] > 0
    assert round(b["blended"] + b["battle_adjustment"], 2) == b["final"]

    tmdb = (await client.get(f"{BASE}/explain/{tmdb_only.id}", headers=admin_headers)).json()["data"]["breakdown"]
    assert tmdb["external_source"] == "tmdb" and tmdb["user_weight"] == 0
    prior = (await client.get(f"{BASE}/explain/{bare.id}", headers=admin_headers)).json()["data"]["breakdown"]
    assert prior["external_source"] == "prior" and prior["final"] == prior["external"]

    assert (await client.get(f"{BASE}/explain/{uuid.uuid4()}", headers=admin_headers)).status_code == 404


async def test_search_by_english_or_persian_title(client, admin_headers, titles):
    hits = (await client.get(f"{BASE}/titles", headers=admin_headers, params={"q": "امتیاز"})).json()["data"]
    assert [h["slug"] for h in hits] == ["rated"]
    hits = (await client.get(f"{BASE}/titles", headers=admin_headers, params={"q": "show"})).json()["data"]
    assert [h["slug"] for h in hits] == ["bare-show"]


async def test_drift_then_recompute(client, db_session, test_user, admin_headers, titles):
    rated, tmdb_only, _ = titles
    report = (await client.get(f"{BASE}/drift", headers=admin_headers)).json()["data"]
    assert report["checked"] == 3 and report["drifted"] == 0

    # A new rating changes what the formula gives, but nothing has recomputed yet. It also
    # moves the platform average, so the other title with user votes drifts too; the
    # unrated show (user weight 0) does not.
    db_session.add(UserRating(user_id=test_user.id, entity_id=tmdb_only.id, score=1))
    await db_session.commit()
    report = (await client.get(f"{BASE}/drift", headers=admin_headers)).json()["data"]
    assert report["drifted"] == 2 and {r["title"]["slug"] for r in report["rows"]} == {"tmdb-only", "rated"}
    diffs = [abs(r["stored_score"] - r["current_score"]) for r in report["rows"]]
    assert diffs == sorted(diffs, reverse=True)  # biggest change first
    row = next(r for r in report["rows"] if r["title"]["slug"] == "tmdb-only")
    assert row["current_score"] < row["stored_score"]  # a 1-star rating pulls it down

    one = [r["title"]["id"] for r in report["rows"] if r["title"]["slug"] == "tmdb-only"]
    res = await client.post(f"{BASE}/recompute", headers=admin_headers, json={"entity_ids": one})
    assert res.status_code == 200 and res.json()["data"] == {"recomputed": 1}
    res = await client.post(f"{BASE}/recompute", headers=admin_headers, json={"entity_ids": report["drifted_ids"]})
    assert res.json()["data"] == {"recomputed": 2}
    assert (await client.get(f"{BASE}/drift", headers=admin_headers)).json()["data"]["drifted"] == 0
    stored = await db_session.get(EntityRanking, tmdb_only.id)
    await db_session.refresh(stored)
    assert stored.computed_score == row["current_score"]

    logs = (await db_session.execute(
        select(AdminAuditLog).where(AdminAuditLog.action == "ranking.recompute").order_by(AdminAuditLog.created_at)
    )).scalars().all()
    assert [(log.target_id, log.after["count"]) for log in logs] == [(str(tmdb_only.id), 1), ("bulk", 2)]


async def test_health(client, admin_headers, titles):
    data = (await client.get(f"{BASE}/health", headers=admin_headers)).json()["data"]
    movie = next(t for t in data["types"] if t["entity_type"] == "movie")
    assert movie["total"] == 2 and movie["ranked"] == 2 and movie["with_user_votes"] == 1 and movie["with_battles"] == 1
    assert sum(movie["histogram"]) == 2 and len(movie["histogram"]) == 10
    assert data["ratings_total"] == 1 and data["platform_avg"] == 5.0
    assert data["elo_entities"] == 1 and data["elo_max"] == 1400.0
    assert data["taste"]["users_with_snapshot"] == 0
