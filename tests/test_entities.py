"""
Tests for the entities knowledge-graph repository and read endpoints.
Run with: pytest tests/test_entities.py
"""
from app.modules.entities.repository import EntityRepository


async def test_create_and_get_by_slug(db_session):
    repo = EntityRepository(db_session)
    created = await repo.create_entity(
        entity_type="movie",
        external_id="tmdb-1",
        external_source="tmdb",
        title="A Test Movie",
        slug="a-test-movie",
        attributes={"year": 2020},
    )
    await db_session.commit()

    fetched = await repo.get_by_slug("a-test-movie")
    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.attributes["year"] == 2020


async def test_get_by_external_id(db_session):
    repo = EntityRepository(db_session)
    await repo.create_entity(
        entity_type="person",
        external_id="tmdb-person-42",
        external_source="tmdb_person",
        title="A Director",
        slug="a-director-42",
        attributes={},
    )
    await db_session.commit()

    found = await repo.get_by_external_id("tmdb_person", "tmdb-person-42")
    assert found is not None
    assert found.title == "A Director"

    missing = await repo.get_by_external_id("tmdb_person", "does-not-exist")
    assert missing is None


async def test_create_relationship_and_get_related(db_session):
    repo = EntityRepository(db_session)
    movie = await repo.create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Movie With Genre", slug="movie-with-genre", attributes={},
    )
    genre = await repo.create_entity(
        entity_type="genre", external_id=None, external_source=None,
        title="Drama", slug="drama", attributes={},
    )
    await db_session.commit()

    await repo.create_relationship(movie.id, genre.id, "has_genre")
    await db_session.commit()

    related = await repo.get_related(movie.id, relation_type="has_genre")
    assert len(related) == 1
    assert related[0].to_entity.id == genre.id


async def test_create_relationship_is_idempotent(db_session):
    # create_relationship uses ON CONFLICT DO NOTHING on the
    # (from_entity_id, to_entity_id, relation_type) unique constraint.
    repo = EntityRepository(db_session)
    movie = await repo.create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Dup Edge Movie", slug="dup-edge-movie", attributes={},
    )
    genre = await repo.create_entity(
        entity_type="genre", external_id=None, external_source=None,
        title="Comedy", slug="comedy", attributes={},
    )
    await db_session.commit()

    await repo.create_relationship(movie.id, genre.id, "has_genre")
    await repo.create_relationship(movie.id, genre.id, "has_genre")
    await db_session.commit()

    related = await repo.get_related(movie.id, relation_type="has_genre")
    assert len(related) == 1


async def test_replace_relationships_removes_stale_and_adds_missing(db_session):
    repo = EntityRepository(db_session)
    movie = await repo.create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Replace Edges Movie", slug="replace-edges-movie", attributes={},
    )
    old_genre = await repo.create_entity(
        entity_type="genre", external_id=None, external_source=None,
        title="Old Genre", slug="old-genre", attributes={},
    )
    new_genre = await repo.create_entity(
        entity_type="genre", external_id=None, external_source=None,
        title="New Genre", slug="new-genre", attributes={},
    )
    await db_session.commit()

    await repo.create_relationship(movie.id, old_genre.id, "has_genre")
    await db_session.commit()

    await repo.replace_relationships(movie.id, "has_genre", [new_genre.id])
    await db_session.commit()

    related = await repo.get_related(movie.id, relation_type="has_genre")
    related_ids = {r.to_entity_id for r in related}
    assert related_ids == {new_genre.id}


async def test_replace_relationships_with_empty_list_removes_all(db_session):
    repo = EntityRepository(db_session)
    movie = await repo.create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Clear Edges Movie", slug="clear-edges-movie", attributes={},
    )
    genre = await repo.create_entity(
        entity_type="genre", external_id=None, external_source=None,
        title="Some Genre", slug="some-genre", attributes={},
    )
    await db_session.commit()

    await repo.create_relationship(movie.id, genre.id, "has_genre")
    await db_session.commit()

    await repo.replace_relationships(movie.id, "has_genre", [])
    await db_session.commit()

    related = await repo.get_related(movie.id, relation_type="has_genre")
    assert related == []


async def test_list_movies_endpoint_returns_seeded_movie(client, db_session):
    repo = EntityRepository(db_session)
    await repo.create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Listed Movie", slug="listed-movie", attributes={},
    )
    await db_session.commit()

    res = await client.get("/api/v1/movies")
    assert res.status_code == 200
    slugs = [m["slug"] for m in res.json()["data"]]
    assert "listed-movie" in slugs


async def test_get_movie_by_slug_endpoint(client, db_session):
    repo = EntityRepository(db_session)
    await repo.create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Detail Movie", slug="detail-movie", attributes={},
    )
    await db_session.commit()

    res = await client.get("/api/v1/movies/detail-movie")
    assert res.status_code == 200
    assert res.json()["data"]["slug"] == "detail-movie"


async def test_get_movie_by_slug_404_when_missing(client):
    res = await client.get("/api/v1/movies/does-not-exist")
    assert res.status_code == 404
