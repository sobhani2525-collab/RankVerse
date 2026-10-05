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


async def test_search_matches_persian_title_with_arabic_keyboard_variants(client, db_session):
    """title_fa lives in attributes, not the title column -- and Arabic
    keyboards type ي/ك where the stored title has Persian ی/ک."""
    repo = EntityRepository(db_session)
    await repo.create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Silent", slug="silent-search-test", attributes={"title_fa": "سایلنت کوچک"},
    )
    await db_session.commit()

    for q in ["سایلنت", "سايلنت كوچك"]:
        res = await client.get("/api/v1/search", params={"q": q})
        assert res.status_code == 200
        results = res.json()["data"]
        assert [r["slug"] for r in results] == ["silent-search-test"]
        assert results[0]["title_fa"] == "سایلنت کوچک"


# --- Ranking within a match tier (pure, no DB) ---

def _entity(title, entity_type="movie"):
    from app.modules.entities.models import Entity

    return Entity(entity_type=entity_type, title=title, slug=title.lower().replace(" ", "-"), attributes={})


def test_better_match_tier_beats_popularity():
    from app.modules.search.router import rerank

    exact, famous_substring = _entity("Nolan"), _entity("Big Nolan Movie")
    assert rerank([(famous_substring, 2, 9.9), (exact, 0, 0.0)], 5) == [exact, famous_substring]


def test_within_a_tier_more_prominent_entity_wins():
    from app.modules.search.router import popularity, rerank

    obscure = _entity("Nolan Nobody", "person")
    famous = _entity("Christopher Nolan", "person")
    rows = [
        (obscure, 1, popularity(obscure, None, 1)),
        (famous, 1, popularity(famous, None, 15)),
    ]
    assert rerank(rows, 5) == [famous, obscure]


def test_popularity_scales_people_logarithmically_and_caps():
    from app.modules.search.router import PERSON_CREDITS_CAP, popularity

    person = _entity("P", "person")
    assert popularity(person, None, 0) == 0
    assert popularity(person, None, 5) > popularity(person, None, 1)
    assert popularity(person, None, PERSON_CREDITS_CAP) == popularity(person, None, 500) == 10
    assert popularity(_entity("M"), 8.4, 0) == 8.4
    assert popularity(_entity("M"), None, 0) == 0


def test_rerank_respects_limit_and_title_length_tiebreak():
    from app.modules.search.router import rerank

    short, long_ = _entity("Up"), _entity("Up in the Air")
    assert rerank([(long_, 1, 5.0), (short, 1, 5.0)], 1) == [short]
