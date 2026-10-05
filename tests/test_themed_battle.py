"""
Tests for GET /battles/themed's named-theme support (theme_kind + theme_value,
used by the shared result page's "تو هم نبرد کن" link).

Run with: TEST_DATABASE_URL=... pytest tests/test_themed_battle.py
"""
from app.modules.entities.models import EntityRanking
from app.modules.entities.repository import EntityRepository


async def _movie(repo, slug: str, year: int):
    movie = await repo.create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title=slug, slug=slug, attributes={"poster_path": "/x.jpg", "year": year},
    )
    # The guest pool (random theme) only draws from ranked movies.
    repo.db.add(EntityRanking(entity_id=movie.id, computed_score=7.0, total_votes=0))
    return movie


async def _seed_decade(db_session, count: int, year: int = 1994, prefix: str = "tb"):
    repo = EntityRepository(db_session)
    for i in range(count):
        await _movie(repo, f"{prefix}-{year}-{i}", year + i % 5)
    await db_session.commit()


async def test_themed_named_decade(client, db_session):
    await _seed_decade(db_session, 6)
    res = await client.get("/api/v1/battles/themed", params={"theme_kind": "decade", "theme_value": "1990"})
    assert res.status_code == 200
    body = res.json()
    assert body["theme"] == {"kind": "decade", "value": "1990", "personalized": False}
    assert len(body["items"]) == 6
    assert all(1990 <= i["year"] <= 1999 for i in body["items"])


async def test_themed_named_genre(client, db_session):
    repo = EntityRepository(db_session)
    genre = await repo.create_entity(
        entity_type="genre", external_id=None, external_source=None,
        title="Noir Test", slug="noir-test", attributes={},
    )
    for i in range(5):
        m = await _movie(repo, f"noir-m-{i}", 1950 + i)
        await repo.create_relationship(m.id, genre.id, "has_genre")
    await db_session.commit()
    res = await client.get("/api/v1/battles/themed", params={"theme_kind": "genre", "theme_value": "noir test"})
    assert res.status_code == 200
    assert res.json()["theme"]["kind"] == "genre"
    assert len(res.json()["items"]) == 5


async def test_themed_invalid_kind_is_422(client):
    res = await client.get("/api/v1/battles/themed", params={"theme_kind": "mood", "theme_value": "x"})
    assert res.status_code == 422


async def test_themed_unknown_theme_falls_back(client, db_session):
    await _seed_decade(db_session, 6, year=1980, prefix="fb")
    res = await client.get("/api/v1/battles/themed", params={"theme_kind": "director", "theme_value": "Nobody Atall"})
    assert res.status_code == 200
    assert res.json()["theme"]["kind"] != "director"


async def test_themed_small_decade_falls_back(client, db_session):
    await _seed_decade(db_session, 6, year=1980, prefix="fs")
    # Nothing in the 1920s -> fall back to the usual random pool, not an error.
    res = await client.get("/api/v1/battles/themed", params={"theme_kind": "decade", "theme_value": "1920"})
    assert res.status_code == 200
    assert res.json()["theme"]["value"] != "1920"


async def test_themed_without_params_unchanged(client, db_session):
    await _seed_decade(db_session, 6, year=1980, prefix="np")
    res = await client.get("/api/v1/battles/themed")
    assert res.status_code == 200
    assert res.json()["theme"]["kind"] in ("genre", "decade", "director")
