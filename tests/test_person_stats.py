import itertools

import pytest
from sqlalchemy import func, select

from app.config import settings
from app.modules.entities.models import EntityRanking, PersonStats
from app.modules.entities.person_stats import refresh_person_stats
from app.modules.entities.repository import EntityRepository


async def _seed(db):
    repo = EntityRepository(db)
    n = itertools.count()

    async def mk(t, slug, **attrs):
        return await repo.create_entity(
            entity_type=t, external_id=f"e{next(n)}", external_source="t", title=slug, slug=slug, attributes=attrs
        )

    directors = [await mk("person", f"dir-{i}") for i in range(2)]
    actor = await mk("person", "actor")
    movies = [
        await mk("movie", f"m{i}", original_language="fa" if i % 2 else "en") for i in range(5)
    ]
    await db.flush()
    for i, m in enumerate(movies):
        db.add(EntityRanking(entity_id=m.id, computed_score=5.0 + i * 0.5, total_votes=1))
        await repo.create_relationship(m.id, directors[0].id if i < 4 else directors[1].id, "directed_by")
        await repo.create_relationship(m.id, actor.id, "acted_in")
    await db.commit()


@pytest.mark.parametrize("role", ["all", "director", "actor"])
@pytest.mark.parametrize("origin", ["all", "persian", "foreign"])
@pytest.mark.parametrize("sort", ["works", "score"])
async def test_stats_path_matches_live_aggregation(db_session, role, origin, sort):
    await _seed(db_session)
    repo = EntityRepository(db_session)
    live = await repo.list_people(1, 10, role, sort, origin)
    assert (await db_session.execute(select(func.count()).select_from(PersonStats))).scalar_one() == 0

    await refresh_person_stats(db_session)
    fast = await repo.list_people(1, 10, role, sort, origin)

    assert [(e.slug, w, round(a, 6) if a is not None else None) for e, w, a in fast[0]] == [
        (e.slug, w, round(a, 6) if a is not None else None) for e, w, a in live[0]
    ]
    assert fast[1] == live[1]


async def test_refresh_replaces_rows_and_is_idempotent(db_session):
    await _seed(db_session)
    first = await refresh_person_stats(db_session)
    assert first > 0
    assert await refresh_person_stats(db_session) == first


async def test_empty_table_falls_back_to_live_query(db_session):
    await _seed(db_session)
    people, total = await EntityRepository(db_session).list_people(1, 10, "all", "works")
    assert total == 3 and len(people) == 3


async def test_refresh_endpoint_requires_internal_key(client, monkeypatch):
    monkeypatch.setattr(settings, "internal_api_key", "k")
    url = "/api/v1/internal/rankings/people/refresh?wait=true"
    assert (await client.post(url)).status_code == 401
    res = await client.post(url, headers={"X-Internal-API-Key": "k"})
    assert res.status_code == 200 and res.json()["data"]["started"] is True


class _SessionCtx:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, *exc):
        return False


async def test_refresh_if_stale_builds_then_skips_while_fresh(db_session, monkeypatch):
    from datetime import timedelta

    from app.modules.entities import person_stats

    vacuums = []

    async def fake_vacuum():
        vacuums.append(1)

    monkeypatch.setattr(person_stats, "AsyncSessionLocal", lambda: _SessionCtx(db_session))
    monkeypatch.setattr(person_stats, "vacuum_person_stats", fake_vacuum)
    await _seed(db_session)

    assert await person_stats.refresh_if_stale(timedelta(hours=6)) is True  # empty table
    assert await person_stats.refresh_if_stale(timedelta(hours=6)) is False  # just built
    await db_session.execute(PersonStats.__table__.update().values(updated_at=func.now() - timedelta(hours=7)))
    person_stats._known_fresh_until = None  # this process re-checks once its known-fresh window has passed
    assert await person_stats.refresh_if_stale(timedelta(hours=6)) is True
    assert vacuums == [1, 1]  # vacuumed after each rebuild, not after the skipped check


async def test_refresh_skips_when_another_process_holds_the_lock(db_session, test_engine):
    from sqlalchemy import text

    from app.modules.entities import person_stats

    await _seed(db_session)
    async with test_engine.connect() as other:
        await other.execute(text("SELECT pg_advisory_lock(:k)"), {"k": person_stats._ADVISORY_KEY})
        try:
            assert await refresh_person_stats(db_session) is None
        finally:
            await other.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": person_stats._ADVISORY_KEY})
    assert await refresh_person_stats(db_session) > 0
