"""
Admin dashboard platform stats (/admin/dashboard/stats).
Run with: pytest tests/test_admin_dashboard.py
"""
from datetime import timedelta

import pytest
import pytest_asyncio

from app.core.security import create_admin_access_token, hash_password
from app.modules.admin.models import AdminAccount
from app.modules.alerts.models import AdminAlert
from app.modules.battles.models import PairVote, VoteOutcome
from app.modules.contact.models import ContactMessage
from app.modules.daily_battle.models import DailyBattle
from app.modules.daily_battle.tehran import tehran_today, utcnow
from app.modules.entities.models import Entity, EntityComment
from app.modules.lists.models import UserList
from app.modules.users.models import User, UserRating

URL = "/api/v1/admin/dashboard/stats"


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


async def test_counts_and_daily_trend(client, db_session, test_user, admin_headers):
    now = utcnow()
    old = now - timedelta(days=10)
    db_session.add_all([
        User(email="old@example.com", username="old", hashed_password="x", created_at=old, last_login_at=now),
        User(email="gone@example.com", username="gone", hashed_password="x", deleted_at=now),
    ])
    movies = [Entity(entity_type="movie", title=f"Movie {i}", slug=f"movie-{i}") for i in range(3)]
    db_session.add_all([*movies, Entity(entity_type="tv_series", title="Show", slug="show"),
                        Entity(entity_type="person", title="Someone", slug="someone")])
    await db_session.flush()
    db_session.add_all([
        UserList(user_id=test_user.id, title="Public", slug="public-list"),
        UserList(user_id=test_user.id, title="Private", slug="private-list", visibility="private"),
        UserList(user_id=test_user.id, title="Watch later", slug="watch-later", visibility="private",
                 is_watch_later=True),
        UserRating(user_id=test_user.id, entity_id=movies[0].id, score=5),
        UserRating(user_id=test_user.id, entity_id=movies[1].id, score=3, created_at=old),
        PairVote(user_id=test_user.id, category="movie", left_item=movies[0].id, right_item=movies[1].id,
                 winner=VoteOutcome.LEFT),
        EntityComment(entity_id=movies[0].id, user_id=test_user.id, body="nice"),
        ContactMessage(category="bug", subject="s", message="m"),
        ContactMessage(category="bug", subject="s", message="m", status="reviewed"),
        AdminAlert(severity="critical", source="test", title="down", fingerprint="a"),
        AdminAlert(severity="warning", source="test", title="slow", fingerprint="b"),
        AdminAlert(severity="critical", source="test", title="old", fingerprint="c", resolved_at=now),
        DailyBattle(battle_date=tehran_today(now), left_id=movies[0].id, right_id=movies[1].id,
                    left_votes=4, right_votes=2),
    ])
    await db_session.commit()

    res = await client.get(URL, headers=admin_headers)
    assert res.status_code == 200
    data = res.json()["data"]

    assert data["users"]["total"] == 2  # test_user + old; the deleted one is left out
    assert data["users"]["new_7d"] == 1
    assert data["users"]["active_7d"] == 1
    assert data["catalog"] == {"movies": 3, "tv_series": 1, "people": 1}
    assert data["lists"] == {"total": 2, "public": 1, "new_7d": 2}
    assert data["ratings"]["total"] == 2 and data["ratings"]["last_7d"] == 1
    assert data["votes"]["total"] == 1 and data["votes"]["change_pct"] is None
    assert data["comments"]["last_7d"] == 1
    assert data["inbox"] == {"new_messages": 1, "open_alerts": 2, "critical_alerts": 1}
    assert data["daily_battle"] == {"scheduled_today": True, "votes_today": 6}

    days = data["days"]
    assert len(days) == 30
    assert days[-1]["date"] == tehran_today(now).isoformat()
    assert days[-1]["ratings"] == 1 and days[-1]["votes"] == 1 and days[-1]["signups"] == 1
    assert sum(d["ratings"] for d in days) == 2
