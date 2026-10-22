"""
Admin usage analytics (/admin/analytics).
Run with: pytest tests/test_admin_analytics.py
"""
from datetime import timedelta

import pytest
import pytest_asyncio

from app.core.security import create_admin_access_token, hash_password
from app.modules.admin.models import AdminAccount
from app.modules.battles.models import PairVote, VoteOutcome
from app.modules.battles.tournament_models import Battle, BattlePick
from app.modules.daily_battle.models import DailyBattle, DailyBattleVote
from app.modules.daily_battle.tehran import tehran_today, utcnow
from app.modules.entities.models import Entity
from app.modules.lists.models import ListFollow, ListLike, UserList
from app.modules.users.models import User, UserRating
from app.modules.watch.models import WatchLink

URL = "/api/v1/admin/analytics"


@pytest_asyncio.fixture
async def admin_headers(db_session):
    account = AdminAccount(email="admin@example.com", password_hash=hash_password("Sup3rSecret!1234"))
    db_session.add(account)
    await db_session.commit()
    return {"Authorization": f"Bearer {create_admin_access_token(str(account.id))}"}


@pytest.fixture(autouse=True)
def _no_stats_cache(monkeypatch):
    monkeypatch.setattr("app.config.settings.cache_enabled", False)


async def test_requires_admin_token_and_valid_range(client, auth_headers, admin_headers):
    assert (await client.get(URL)).status_code == 401
    assert (await client.get(URL, headers=auth_headers)).status_code == 401
    assert (await client.get(URL, headers=admin_headers, params={"days": 14})).status_code == 400


async def test_range_metrics_and_top_lists(client, db_session, test_user, admin_headers):
    now = utcnow()
    last_week = now - timedelta(days=10)  # inside the previous 7-day range
    idle = User(email="idle@example.com", username="idle", hashed_password="x")
    other = User(email="other@example.com", username="other", hashed_password="x", created_at=last_week)
    db_session.add_all([idle, other])
    a, b, c = (Entity(entity_type="movie", title=t, slug=t.lower()) for t in ("Alpha", "Beta", "Gamma"))
    db_session.add_all([a, b, c])
    await db_session.flush()
    lst = UserList(user_id=other.id, title="Best", slug="best")
    battle = Battle(slug="abcd1234", creator_id=test_user.id, title="Pool", entity_type="movie",
                    bracket_size=8, mode="pool", status="active", visibility="public")
    daily = DailyBattle(battle_date=tehran_today(now), left_id=a.id, right_id=c.id)
    db_session.add_all([lst, battle, daily])
    await db_session.flush()
    db_session.add_all([
        PairVote(user_id=test_user.id, category="movie", left_item=a.id, right_item=b.id, winner=VoteOutcome.LEFT),
        PairVote(user_id=test_user.id, category="movie", left_item=a.id, right_item=b.id, winner=VoteOutcome.SKIP),
        PairVote(user_id=other.id, category="movie", left_item=a.id, right_item=b.id, winner=VoteOutcome.RIGHT,
                 created_at=last_week),
        BattlePick(battle_id=battle.id, user_id=test_user.id, entity_lo=a.id, entity_hi=b.id, winner_entity_id=a.id),
        DailyBattleVote(daily_battle_id=daily.id, user_id=other.id, choice="left"),
        DailyBattleVote(daily_battle_id=daily.id, guest_id="guest-1", choice="right"),
        UserRating(user_id=test_user.id, entity_id=a.id, score=4),
        UserRating(user_id=other.id, entity_id=a.id, score=2),
        UserRating(user_id=other.id, entity_id=b.id, score=5, created_at=last_week),
        ListLike(list_id=lst.id, user_id=test_user.id),
        ListFollow(list_id=lst.id, user_id=test_user.id),
        WatchLink(entity_id=a.id, provider="filimo", url="https://filimo.com/m/1", click_count=7),
        WatchLink(entity_id=b.id, provider="filimo", url="https://filimo.com/m/2", click_count=3),
    ])
    await db_session.commit()

    res = await client.get(URL, headers=admin_headers, params={"days": 7})
    assert res.status_code == 200
    data = res.json()["data"]
    k = data["kpis"]

    assert len(data["days"]) == 7 and data["days"][-1]["date"] == tehran_today(now).isoformat()
    assert k["signups"]["value"] == 2 and k["signups"]["previous"] == 1  # test_user + idle; other last week
    assert k["active_users"]["value"] == 2 and k["active_users"]["previous"] == 1
    # 2 pair votes (a skip still counts as a vote) + 1 pick + 2 daily votes
    assert k["votes"] == {"value": 5, "previous": 1, "change_pct": 400.0}
    assert k["ratings"]["value"] == 2 and k["ratings"]["previous"] == 1
    assert k["list_likes"]["value"] == 1 and k["list_follows"]["value"] == 1
    assert k["battles_created"]["value"] == 1
    # test_user did something after signing up, idle never did
    assert data["activation"] == {"signups": 2, "activated": 1, "rate_pct": 50.0}
    assert data["days"][-1]["active_users"] == 2

    assert data["votes_by_source"] == {"pair": 2, "pool": 1, "bracket": 0, "daily": 2}
    assert data["daily_battle"] == {"member_votes": 1, "guest_votes": 1}
    assert [s["count"] for s in data["rating_distribution"]] == [0, 1, 0, 1, 0]

    # Alpha: pair-vote win + pool pick + daily "left"; Gamma: daily "right"; skips count for nobody
    chosen = {t["title"]: t["count"] for t in data["top_chosen_titles"]}
    assert chosen == {"Alpha": 3, "Gamma": 1}
    assert data["top_rated_titles"][0]["title"] == "Alpha"
    assert data["top_rated_titles"][0]["count"] == 2 and data["top_rated_titles"][0]["avg_score"] == 3.0
    assert data["top_lists"] == [{"id": str(lst.id), "title": "Best", "slug": "best", "owner_username": "other",
                                  "likes": 1, "follows": 1}]
    assert data["top_battles"][0]["picks"] == 1 and data["top_battles"][0]["players"] == 1
    assert data["watch_providers"] == [{"provider": "filimo", "name": "فیلیمو", "links": 2, "clicks": 10}]
