"""
Daily battle: Tehran day boundaries, lazy/idempotent creation, automatic pair
selection, voting (guest + signed-in), streaks and the admin endpoints.

Run with: TEST_DATABASE_URL=... pytest tests/test_daily_battle.py
"""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import func, select

from app.config import settings
from app.core.redis import get_redis
from app.core.security import create_admin_access_token, hash_password
from app.modules.admin.models import AdminAccount
from app.modules.battles.models import EntityEloScore, PairVote
from app.modules.daily_battle import tehran
from app.modules.daily_battle.models import DailyBattle, DailyBattleVote
from app.modules.daily_battle.service import DailyBattleService, streak_from_dates
from app.modules.entities.models import EntityRanking
from app.modules.entities.repository import EntityRepository

URL = "/api/v1/daily-battle"
ADMIN_URL = "/api/v1/admin/daily-battles"
NOW = datetime(2026, 10, 3, 9, 0, tzinfo=timezone.utc)  # 12:30 Tehran, 2026-10-03
TODAY = date(2026, 10, 3)


class FakeRedis:
    def __init__(self, broken: bool = False):
        self.data: dict[str, int] = {}
        self.broken = broken

    async def incr(self, key):
        if self.broken:
            raise ConnectionError("redis down")
        self.data[key] = self.data.get(key, 0) + 1
        return self.data[key]

    async def expire(self, key, seconds):
        return True


@pytest.fixture(autouse=True)
def fake_redis():
    from app.main import app

    redis = FakeRedis()
    app.dependency_overrides[get_redis] = lambda: redis
    yield redis
    app.dependency_overrides.pop(get_redis, None)


@pytest.fixture(autouse=True)
def fixed_clock(monkeypatch):
    monkeypatch.setattr(tehran, "utcnow", lambda: NOW)


def _guest(n: int = 1) -> dict:
    return {"X-Guest-Id": str(uuid.UUID(int=n))}


async def _movies(db, count: int, year: int = 1994, prefix: str = "db", elo: float | None = None):
    repo = EntityRepository(db)
    out = []
    for i in range(count):
        m = await repo.create_entity(
            entity_type="movie", external_id=None, external_source=None,
            title=f"{prefix} {i}", slug=f"{prefix}-{i}-{uuid.uuid4().hex[:6]}",
            attributes={"poster_path": "/p.jpg", "title_fa": f"فیلم {prefix} {i}", "year": year + i % 5},
        )
        db.add(EntityRanking(entity_id=m.id, computed_score=9.0 - i * 0.01))
        if elo is not None:
            db.add(EntityEloScore(entity_id=m.id, category="movie", elo_score=elo))
        out.append(m)
    await db.commit()
    return out


async def _battle(db, left, right, battle_date=TODAY, **kw) -> DailyBattle:
    b = DailyBattle(battle_date=battle_date, left_id=left.id, right_id=right.id, **kw)
    db.add(b)
    await db.commit()
    return b


@pytest_asyncio.fixture
async def admin_headers(db_session):
    admin = AdminAccount(email="admin@example.com", password_hash=hash_password("Sup3rSecret!1234"))
    db_session.add(admin)
    await db_session.commit()
    return {"Authorization": f"Bearer {create_admin_access_token(str(admin.id))}"}


# --- Tehran day boundaries ----------------------------------------------------

def test_tehran_midnight_boundary():
    before = datetime(2026, 10, 3, 20, 29, tzinfo=timezone.utc)  # 23:59 Tehran
    after = datetime(2026, 10, 3, 20, 31, tzinfo=timezone.utc)   # 00:01 next day
    assert tehran.tehran_today(before) == date(2026, 10, 3)
    assert tehran.tehran_today(after) == date(2026, 10, 4)
    assert tehran.tehran_today(datetime(2026, 10, 3, 20, 30, tzinfo=timezone.utc)) == date(2026, 10, 4)
    assert tehran.tehran_today(datetime(2026, 10, 3, 0, 0, tzinfo=timezone.utc)) == date(2026, 10, 3)


def test_seconds_until_next_day():
    assert tehran.seconds_until_next_day(datetime(2026, 10, 3, 20, 29, tzinfo=timezone.utc)) == 60
    assert tehran.seconds_until_next_day(datetime(2026, 10, 3, 20, 31, tzinfo=timezone.utc)) == 24 * 3600 - 60
    assert tehran.seconds_until_next_day(datetime(2026, 10, 3, 20, 30, tzinfo=timezone.utc)) == 24 * 3600


# --- lazy creation ------------------------------------------------------------

async def test_get_or_create_is_lazy_and_idempotent(db_session):
    await _movies(db_session, 12)
    service = DailyBattleService(db_session)
    first = await service.get_or_create_today(NOW)
    second = await service.get_or_create_today(NOW)
    assert first is not None and first.id == second.id
    assert first.battle_date == TODAY and first.left_id != first.right_id
    assert (await db_session.execute(select(func.count()).select_from(DailyBattle))).scalar_one() == 1


async def test_creation_race_returns_the_winning_row(db_session, monkeypatch):
    movies = await _movies(db_session, 12)
    service = DailyBattleService(db_session)
    real_pick = service._pick_pair

    async def racing_pick(today):
        pair = await real_pick(today)
        # Another server inserts today's row between our SELECT and INSERT.
        db_session.add(DailyBattle(battle_date=today, left_id=movies[-1].id, right_id=movies[-2].id))
        await db_session.commit()
        return pair

    monkeypatch.setattr(service, "_pick_pair", racing_pick)
    row = await service.get_or_create_today(NOW)
    assert {row.left_id, row.right_id} == {movies[-1].id, movies[-2].id}
    assert (await db_session.execute(select(func.count()).select_from(DailyBattle))).scalar_one() == 1


async def test_admin_pair_is_used_as_is(db_session):
    a, b, *_ = await _movies(db_session, 12)
    await _battle(db_session, a, b, source="admin")
    row = await DailyBattleService(db_session).get_or_create_today(NOW)
    assert (row.left_id, row.right_id, row.source) == (a.id, b.id, "admin")


# --- automatic selection ------------------------------------------------------

async def test_pick_is_deterministic_per_date(db_session):
    await _movies(db_session, 15)
    service = DailyBattleService(db_session)
    first = await service._pick_pair(TODAY)
    second = await service._pick_pair(TODAY)
    assert (first[0].id, first[1].id, first[2], first[3]) == (second[0].id, second[1].id, second[2], second[3])


async def test_recent_movies_are_excluded(db_session):
    movies = await _movies(db_session, 10)
    await _battle(db_session, movies[0], movies[1], battle_date=TODAY - timedelta(days=5))
    pair = await DailyBattleService(db_session)._pick_pair(TODAY)
    assert {pair[0].id, pair[1].id}.isdisjoint({movies[0].id, movies[1].id})


async def test_old_battles_do_not_block_a_movie(db_session):
    movies = await _movies(db_session, 2)
    await _battle(
        db_session, movies[0], movies[1],
        battle_date=TODAY - timedelta(days=settings.daily_battle_no_repeat_days + 5),
    )
    pair = await DailyBattleService(db_session)._pick_pair(TODAY)
    assert {pair[0].id, pair[1].id} == {movies[0].id, movies[1].id}


async def test_repeat_beats_hiding_when_everything_is_recent(db_session):
    movies = await _movies(db_session, 2)
    await _battle(db_session, movies[0], movies[1], battle_date=TODAY - timedelta(days=3))
    assert await DailyBattleService(db_session)._pick_pair(TODAY) is not None


async def test_no_pair_possible_returns_none(db_session):
    await _movies(db_session, 1)
    assert await DailyBattleService(db_session).get_or_create_today(NOW) is None


async def test_movies_without_poster_or_persian_title_are_skipped(db_session):
    repo = EntityRepository(db_session)
    for i, attrs in enumerate([{"poster_path": "/p.jpg"}, {"title_fa": "فیلم"}]):
        m = await repo.create_entity(
            entity_type="movie", external_id=None, external_source=None,
            title=f"bad{i}", slug=f"bad-{i}", attributes=attrs,
        )
        db_session.add(EntityRanking(entity_id=m.id, computed_score=9.9))
    await db_session.commit()
    assert await DailyBattleService(db_session).get_or_create_today(NOW) is None


async def test_elo_window_prefers_close_ratings_and_widens(db_session):
    near = await _movies(db_session, 3, prefix="near", elo=1200)
    far = await _movies(db_session, 3, prefix="far", elo=1900)
    pair = await DailyBattleService(db_session)._pick_pair(TODAY)
    ids = {m.id for m in near}, {m.id for m in far}
    assert {pair[0].id, pair[1].id} <= ids[0] or {pair[0].id, pair[1].id} <= ids[1]


async def test_elo_window_widens_when_nothing_is_close(db_session):
    a, = await _movies(db_session, 1, prefix="lo", elo=1000)
    b, = await _movies(db_session, 1, prefix="hi", elo=1500)  # gap 500 > 150, within 150*4
    pair = await DailyBattleService(db_session)._pick_pair(TODAY)
    assert {pair[0].id, pair[1].id} == {a.id, b.id}


# --- GET /today and voting ----------------------------------------------------

async def _today(client, headers=None):
    res = await client.get(f"{URL}/today", headers=headers or {})
    assert res.status_code == 200, res.text
    return res.json()


async def test_today_hides_results_until_voted(client, db_session):
    await _movies(db_session, 12)
    body = await _today(client, _guest())
    assert body["results"] is None and body["my_choice"] is None and body["streak"] is None
    assert body["battle_date"] == "2026-10-03"
    assert body["seconds_until_next"] == 11 * 3600 + 1800  # 12:30 Tehran -> midnight
    res = await client.get(f"{URL}/today", headers=_guest())
    assert res.headers["cache-control"] == "no-store"

    voted = await client.post(f"{URL}/vote", headers=_guest(), json={"daily_battle_id": body["daily_battle_id"], "choice": "left"})
    assert voted.status_code == 200
    assert voted.json()["results"] == {"left_votes": 1, "right_votes": 0, "total": 1}
    after = await _today(client, _guest())
    assert after["my_choice"] == "left" and after["results"]["total"] == 1
    # another guest still sees nothing
    assert (await _today(client, _guest(2)))["results"] is None


async def test_today_without_any_pair_is_404(client):
    assert (await client.get(f"{URL}/today")).status_code == 404


async def test_vote_twice_counts_once(client, db_session):
    await _movies(db_session, 12)
    body = await _today(client, _guest())
    payload = {"daily_battle_id": body["daily_battle_id"], "choice": "right"}
    await client.post(f"{URL}/vote", headers=_guest(), json=payload)
    again = await client.post(f"{URL}/vote", headers=_guest(), json={**payload, "choice": "left"})
    assert again.status_code == 200
    assert again.json()["my_choice"] == "right"
    assert again.json()["results"] == {"left_votes": 0, "right_votes": 1, "total": 1}


async def test_vote_validation(client, db_session):
    await _movies(db_session, 12)
    body = await _today(client, _guest())
    bad_choice = await client.post(f"{URL}/vote", headers=_guest(), json={"daily_battle_id": body["daily_battle_id"], "choice": "up"})
    assert bad_choice.status_code == 422
    stale = await client.post(f"{URL}/vote", headers=_guest(), json={"daily_battle_id": str(uuid.uuid4()), "choice": "left"})
    assert stale.status_code == 409
    no_guest = await client.post(f"{URL}/vote", json={"daily_battle_id": body["daily_battle_id"], "choice": "left"})
    assert no_guest.status_code == 400
    bad_guest = await client.post(
        f"{URL}/vote", headers={"X-Guest-Id": "not-a-uuid"}, json={"daily_battle_id": body["daily_battle_id"], "choice": "left"}
    )
    assert bad_guest.status_code == 400


async def test_guest_vote_changes_counter_but_not_elo(client, db_session):
    await _movies(db_session, 12)
    body = await _today(client, _guest())
    await client.post(f"{URL}/vote", headers=_guest(), json={"daily_battle_id": body["daily_battle_id"], "choice": "left"})
    assert (await db_session.execute(select(func.count()).select_from(PairVote))).scalar_one() == 0
    battle = (await db_session.execute(select(DailyBattle))).scalar_one()
    assert (battle.left_votes, battle.right_votes) == (1, 0)


async def test_user_vote_updates_counter_elo_and_streak(client, db_session, auth_headers, test_user):
    await _movies(db_session, 12)
    body = await _today(client, auth_headers)
    assert body["streak"] == 0
    res = await client.post(
        f"{URL}/vote", headers=auth_headers, json={"daily_battle_id": body["daily_battle_id"], "choice": "left"}
    )
    assert res.status_code == 200
    assert res.json()["streak"] == 1
    battle = (await db_session.execute(select(DailyBattle))).scalar_one()
    assert battle.left_votes == 1
    pair_vote = (await db_session.execute(select(PairVote))).scalar_one()
    assert (pair_vote.user_id, pair_vote.left_item, pair_vote.right_item) == (test_user.id, battle.left_id, battle.right_id)
    assert pair_vote.winner.value == "left"
    elo = (await db_session.execute(select(EntityEloScore).where(EntityEloScore.entity_id == battle.left_id))).scalar_one()
    assert elo.elo_score > 1200


async def test_user_takes_precedence_over_guest_id(client, db_session, auth_headers):
    await _movies(db_session, 12)
    body = await _today(client, auth_headers)
    await client.post(
        f"{URL}/vote", headers={**auth_headers, **_guest()}, json={"daily_battle_id": body["daily_battle_id"], "choice": "right"}
    )
    votes = (await db_session.execute(select(DailyBattleVote))).scalars().all()
    assert len(votes) == 1 and votes[0].user_id is not None and votes[0].guest_id is None


async def test_failed_elo_update_keeps_the_daily_vote(client, db_session, auth_headers, monkeypatch):
    from fastapi import HTTPException

    from app.modules.battles.service import BattleService

    async def boom(self, user_id, payload):
        raise HTTPException(status_code=429, detail="Daily vote limit reached")

    monkeypatch.setattr(BattleService, "cast_vote", boom)
    await _movies(db_session, 12)
    body = await _today(client, auth_headers)
    res = await client.post(
        f"{URL}/vote", headers=auth_headers, json={"daily_battle_id": body["daily_battle_id"], "choice": "left"}
    )
    assert res.status_code == 200 and res.json()["my_choice"] == "left"
    battle = (await db_session.execute(select(DailyBattle))).scalar_one()
    assert battle.left_votes == 1
    assert (await db_session.execute(select(func.count()).select_from(DailyBattleVote))).scalar_one() == 1


async def test_guest_ip_limit(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "daily_battle_guest_ip_limit", 2)
    await _movies(db_session, 12)
    body = await _today(client)
    statuses = []
    for n in range(1, 4):
        res = await client.post(
            f"{URL}/vote", headers={**_guest(n), "CF-Connecting-IP": "203.0.113.9"},
            json={"daily_battle_id": body["daily_battle_id"], "choice": "left"},
        )
        statuses.append(res.status_code)
    assert statuses == [200, 200, 429]
    # a different IP is unaffected, and an X-Forwarded-For fallback works
    other = await client.post(
        f"{URL}/vote", headers={**_guest(9), "X-Forwarded-For": "198.51.100.1, 10.0.0.1"},
        json={"daily_battle_id": body["daily_battle_id"], "choice": "left"},
    )
    assert other.status_code == 200


async def test_repeat_vote_does_not_spend_ip_quota(client, db_session, fake_redis):
    await _movies(db_session, 12)
    body = await _today(client)
    for _ in range(3):
        await client.post(
            f"{URL}/vote", headers={**_guest(), "CF-Connecting-IP": "203.0.113.9"},
            json={"daily_battle_id": body["daily_battle_id"], "choice": "left"},
        )
    assert list(fake_redis.data.values()) == [1]


async def test_redis_down_fails_open(client, db_session, fake_redis):
    fake_redis.broken = True
    await _movies(db_session, 12)
    body = await _today(client)
    res = await client.post(
        f"{URL}/vote", headers={**_guest(), "CF-Connecting-IP": "203.0.113.9"},
        json={"daily_battle_id": body["daily_battle_id"], "choice": "left"},
    )
    assert res.status_code == 200


# --- previous day + streak ----------------------------------------------------

async def test_previous_day_result(client, db_session):
    a, b, *_ = await _movies(db_session, 12)
    await _battle(db_session, a, b, battle_date=TODAY - timedelta(days=1), left_votes=3, right_votes=7)
    body = await _today(client, _guest())
    assert body["previous"]["winner"] == "right"
    assert body["previous"]["total"] == 10
    assert body["previous"]["left"]["id"] == str(a.id)


async def test_no_previous_when_yesterday_has_no_battle(client, db_session):
    await _movies(db_session, 12)
    assert (await _today(client, _guest()))["previous"] is None


def test_streak_from_dates():
    d = date(2026, 10, 3)
    days = lambda *offsets: {d - timedelta(days=o) for o in offsets}  # noqa: E731
    assert streak_from_dates(days(0, 1, 2), d) == 3
    assert streak_from_dates(days(1, 2, 3), d) == 3      # today not voted yet: not broken
    assert streak_from_dates(days(0, 1, 3, 4), d) == 2   # a gap breaks it
    assert streak_from_dates(days(2, 3), d) == 0         # yesterday missed
    assert streak_from_dates(set(), d) == 0


async def test_streak_over_http(client, db_session, auth_headers, test_user):
    movies = await _movies(db_session, 12)
    for offset in (1, 2, 3, 5):
        b = await _battle(db_session, movies[0], movies[1], battle_date=TODAY - timedelta(days=offset))
        db_session.add(DailyBattleVote(daily_battle_id=b.id, user_id=test_user.id, choice="left"))
    await db_session.commit()
    assert (await _today(client, auth_headers))["streak"] == 3  # today open, 1-2-3 consecutive


# --- admin --------------------------------------------------------------------

async def test_admin_endpoints_require_admin_token(client, auth_headers):
    assert (await client.get(ADMIN_URL)).status_code == 401
    assert (await client.get(ADMIN_URL, headers=auth_headers)).status_code == 401
    assert (await client.post(ADMIN_URL, headers=auth_headers, json={})).status_code == 401
    assert (await client.delete(f"{ADMIN_URL}/{uuid.uuid4()}", headers=auth_headers)).status_code == 401


async def test_admin_create_list_update_delete(client, db_session, admin_headers):
    a, b, c, *_ = await _movies(db_session, 12)
    tomorrow = (TODAY + timedelta(days=1)).isoformat()
    res = await client.post(
        ADMIN_URL, headers=admin_headers,
        json={"battle_date": tomorrow, "left_id": str(a.id), "right_id": str(b.id), "theme": {"kind": "genre", "value": "درام"}},
    )
    assert res.status_code == 201, res.text
    row = res.json()["data"]
    assert row["source"] == "admin" and row["theme_kind"] == "genre" and row["deletable"] is True

    dup = await client.post(ADMIN_URL, headers=admin_headers, json={"battle_date": tomorrow, "left_id": str(a.id), "right_id": str(b.id)})
    assert dup.status_code == 409

    listing = await client.get(ADMIN_URL, headers=admin_headers)
    assert listing.status_code == 200 and listing.json()["meta"]["total"] == 1

    put = await client.put(f"{ADMIN_URL}/{row['id']}", headers=admin_headers, json={"right_id": str(c.id)})
    assert put.status_code == 200 and put.json()["data"]["right"]["id"] == str(c.id)

    gone = await client.delete(f"{ADMIN_URL}/{row['id']}", headers=admin_headers)
    assert gone.status_code == 200
    assert (await client.get(ADMIN_URL, headers=admin_headers)).json()["meta"]["total"] == 0


async def test_admin_create_validation(client, db_session, admin_headers):
    a, b, *_ = await _movies(db_session, 4)
    past = (TODAY - timedelta(days=1)).isoformat()
    future = (TODAY + timedelta(days=2)).isoformat()
    assert (await client.post(ADMIN_URL, headers=admin_headers, json={"battle_date": past, "left_id": str(a.id), "right_id": str(b.id)})).status_code == 409
    assert (await client.post(ADMIN_URL, headers=admin_headers, json={"battle_date": future, "left_id": str(a.id), "right_id": str(a.id)})).status_code == 400
    assert (await client.post(ADMIN_URL, headers=admin_headers, json={"battle_date": future, "left_id": str(a.id), "right_id": str(uuid.uuid4())})).status_code == 404


async def test_admin_cannot_change_or_delete_after_first_vote(client, db_session, admin_headers):
    a, b, c, *_ = await _movies(db_session, 6)
    tomorrow = TODAY + timedelta(days=1)
    voted = await _battle(db_session, a, b, battle_date=tomorrow, source="admin", left_votes=1)
    put = await client.put(f"{ADMIN_URL}/{voted.id}", headers=admin_headers, json={"right_id": str(c.id)})
    assert put.status_code == 409
    assert (await client.delete(f"{ADMIN_URL}/{voted.id}", headers=admin_headers)).status_code == 409
    row = (await client.get(ADMIN_URL, headers=admin_headers)).json()["data"][0]
    assert row["editable"] is False and row["deletable"] is False and row["left_percent"] == 100


async def test_admin_cannot_delete_today(client, db_session, admin_headers):
    a, b, *_ = await _movies(db_session, 4)
    today_row = await _battle(db_session, a, b, source="admin")
    assert (await client.delete(f"{ADMIN_URL}/{today_row.id}", headers=admin_headers)).status_code == 409


async def test_auto_pick_falls_back_after_admin_row_deleted(client, db_session, admin_headers):
    await _movies(db_session, 12)
    a, b = (await _movies(db_session, 2, prefix="adm"))
    future_day = TODAY + timedelta(days=1)
    res = await client.post(ADMIN_URL, headers=admin_headers, json={"battle_date": future_day.isoformat(), "left_id": str(a.id), "right_id": str(b.id)})
    await client.delete(f"{ADMIN_URL}/{res.json()['data']['id']}", headers=admin_headers)
    assert await DailyBattleService(db_session).get_by_date(future_day) is None
