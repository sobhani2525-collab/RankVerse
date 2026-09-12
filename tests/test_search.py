"""
Tests for GET /search -- the global search endpoint used by SearchBox.tsx
(no type filter, searches every entity_type) and AddListItem.tsx (a type
filter scopes it to one entity_type, e.g. adding to a movie-only list).
Run with: TEST_DATABASE_URL=... pytest tests/test_search.py
"""
from app.modules.entities.repository import EntityRepository


async def _seed(db_session):
    repo = EntityRepository(db_session)
    await repo.create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Breaking Bad: El Camino", slug="el-camino-search-test", attributes={},
    )
    await repo.create_entity(
        entity_type="tv_series", external_id=None, external_source=None,
        title="Breaking Bad", slug="breaking-bad-search-test", attributes={},
    )
    await repo.create_entity(
        entity_type="tv_series", external_id=None, external_source=None,
        title="Game of Thrones", slug="got-search-test", attributes={},
    )
    await repo.create_entity(
        entity_type="person", external_id=None, external_source=None,
        title="Breaking Bad Fan Club Founder", slug="bb-fan-search-test", attributes={},
    )
    await db_session.commit()


async def test_search_without_type_returns_every_entity_type(client, db_session):
    await _seed(db_session)

    res = await client.get("/api/v1/search", params={"q": "Breaking Bad"})
    assert res.status_code == 200
    results = res.json()["data"]
    types = {r["type"] for r in results}
    titles = {r["title"] for r in results}
    assert types == {"movie", "tv_series", "person"}
    assert "Breaking Bad" in titles


async def test_search_with_type_stays_scoped_to_one_entity_type(client, db_session):
    """AddListItem.tsx's use case -- must keep working exactly as before."""
    await _seed(db_session)

    res = await client.get("/api/v1/search", params={"q": "Breaking Bad", "type": "tv_series"})
    assert res.status_code == 200
    results = res.json()["data"]
    assert {r["type"] for r in results} == {"tv_series"}
    assert {r["title"] for r in results} == {"Breaking Bad"}


async def test_search_game_of_thrones_finds_tv_series(client, db_session):
    await _seed(db_session)

    res = await client.get("/api/v1/search", params={"q": "Game of Thrones"})
    assert res.status_code == 200
    results = res.json()["data"]
    assert len(results) == 1
    assert results[0]["type"] == "tv_series"
    assert results[0]["slug"] == "got-search-test"
