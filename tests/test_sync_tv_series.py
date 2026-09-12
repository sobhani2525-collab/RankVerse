"""
Integration tests for the tv_series sync pipeline (SyncService.sync_tv_series
+ normalize_tv_series), run against a real Postgres db_session with
TMDbClient.get_tv_series monkeypatched -- no live TMDb network access
required. Fixture data mirrors real TMDb /tv/{id}?append_to_response=credits
response shapes, modeled on Breaking Bad and Better Call Saul (which share
cast members in reality) to exercise cross-series person dedup.

Run with: TEST_DATABASE_URL=... pytest tests/test_sync_tv_series.py
"""
from app.modules.entities.repository import EntityRepository
from app.modules.sync.service import SyncService
from app.modules.sync.tmdb_client import TMDbClient

BREAKING_BAD = {
    "id": 1396,
    "name": "Breaking Bad",
    "overview": "A high school chemistry teacher diagnosed with cancer teams with a former student to cook and sell crystal meth.",
    "poster_path": "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
    "first_air_date": "2008-01-20",
    "last_air_date": "2013-09-29",
    "number_of_seasons": 5,
    "number_of_episodes": 62,
    "status": "Ended",
    "vote_average": 8.9,
    "vote_count": 14500,
    "origin_country": ["US"],
    "genres": [{"id": 80, "name": "Crime"}, {"id": 18, "name": "Drama"}],
    "created_by": [{"id": 66633, "name": "Vince Gilligan"}],
    "networks": [{"id": 174, "name": "AMC"}],
    "credits": {
        "cast": [
            {"id": 17419, "name": "Bryan Cranston", "character": "Walter White", "order": 0},
            {"id": 39885, "name": "Jonathan Banks", "character": "Mike Ehrmantraut", "order": 1},
        ],
        "crew": [],
    },
}

BETTER_CALL_SAUL = {
    "id": 60059,
    "name": "Better Call Saul",
    "overview": "The trials and tribulations of criminal lawyer Jimmy McGill.",
    "poster_path": "/fC2HDm5t0kHl7mTm7jxMR31b7by.jpg",
    "first_air_date": "2015-02-08",
    "last_air_date": "2022-08-15",
    "number_of_seasons": 6,
    "number_of_episodes": 63,
    "status": "Ended",
    "vote_average": 8.6,
    "vote_count": 4200,
    "origin_country": ["US"],
    "genres": [{"id": 80, "name": "Crime"}, {"id": 18, "name": "Drama"}],
    "created_by": [{"id": 66633, "name": "Vince Gilligan"}, {"id": 1223789, "name": "Peter Gould"}],
    "networks": [{"id": 174, "name": "AMC"}],
    "credits": {
        "cast": [
            {"id": 234352, "name": "Bob Odenkirk", "character": "Jimmy McGill", "order": 0},
            {"id": 39885, "name": "Jonathan Banks", "character": "Mike Ehrmantraut", "order": 1},
        ],
        "crew": [],
    },
}

GAME_OF_THRONES = {
    "id": 1399,
    "name": "Game of Thrones",
    "overview": "Nine noble families fight for control over the mythical lands of Westeros.",
    "poster_path": "/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg",
    "first_air_date": "2011-04-17",
    "last_air_date": "2019-05-19",
    "number_of_seasons": 8,
    "number_of_episodes": 73,
    "status": "Ended",
    "vote_average": 8.4,
    "vote_count": 22000,
    "origin_country": ["US"],
    # "Action & Adventure" should map onto an existing "Action" genre via
    # TV_GENRE_NAME_OVERRIDES rather than creating a duplicate genre entity.
    "genres": [{"id": 10759, "name": "Action & Adventure"}, {"id": 18, "name": "Drama"}],
    "created_by": [{"id": 9813, "name": "David Benioff"}],
    "networks": [{"id": 49, "name": "HBO"}],
    "credits": {"cast": [], "crew": []},
}

FIXTURES_BY_ID = {1396: BREAKING_BAD, 60059: BETTER_CALL_SAUL, 1399: GAME_OF_THRONES}


def _patch_tmdb(monkeypatch):
    async def fake_get_tv_series(self, tmdb_id: int) -> dict:
        return FIXTURES_BY_ID[tmdb_id]

    monkeypatch.setattr(TMDbClient, "get_tv_series", fake_get_tv_series)


async def test_sync_tv_series_creates_entity_with_attributes(db_session, monkeypatch):
    _patch_tmdb(monkeypatch)
    service = SyncService(db_session)

    result = await service.sync_tv_series(1396)

    entity = await EntityRepository(db_session).get_by_slug(result["slug"])
    assert entity.entity_type == "tv_series"
    assert entity.external_source == "tmdb"
    assert entity.external_id == "1396"
    assert entity.attributes["number_of_seasons"] == 5
    assert entity.attributes["number_of_episodes"] == 62
    assert entity.attributes["status"] == "Ended"
    assert entity.attributes["first_air_date"] == "2008-01-20"
    assert entity.attributes["last_air_date"] == "2013-09-29"


async def test_sync_tv_series_creates_expected_relationship_types(db_session, monkeypatch):
    _patch_tmdb(monkeypatch)
    service = SyncService(db_session)
    result = await service.sync_tv_series(1396)
    repo = EntityRepository(db_session)
    entity = await repo.get_by_slug(result["slug"])

    creators = await repo.get_related(entity.id, relation_type="creator")
    networks = await repo.get_related(entity.id, relation_type="aired_on")
    cast = await repo.get_related(entity.id, relation_type="acted_in")
    genres = await repo.get_related(entity.id, relation_type="has_genre")

    assert {p.to_entity.title for p in creators} == {"Vince Gilligan"}
    assert {n.to_entity.title for n in networks} == {"AMC"}
    assert networks[0].to_entity.entity_type == "production_company"
    assert {c.to_entity.title for c in cast} == {"Bryan Cranston", "Jonathan Banks"}
    assert {g.to_entity.title for g in genres} == {"Crime", "Drama"}


async def test_sync_tv_series_dedupes_person_shared_across_series(db_session, monkeypatch):
    _patch_tmdb(monkeypatch)
    service = SyncService(db_session)

    bb = await service.sync_tv_series(1396)
    bcs = await service.sync_tv_series(60059)

    repo = EntityRepository(db_session)
    jonathan_banks = await repo.get_by_external_id("tmdb_person", "39885")
    vince_gilligan = await repo.get_by_external_id("tmdb_person", "66633")
    assert jonathan_banks is not None
    assert vince_gilligan is not None

    bb_entity = await repo.get_by_slug(bb["slug"])
    bcs_entity = await repo.get_by_slug(bcs["slug"])

    bb_cast_ids = {r.to_entity_id for r in await repo.get_related(bb_entity.id, "acted_in")}
    bcs_cast_ids = {r.to_entity_id for r in await repo.get_related(bcs_entity.id, "acted_in")}
    assert jonathan_banks.id in bb_cast_ids
    assert jonathan_banks.id in bcs_cast_ids

    bb_creator_ids = {r.to_entity_id for r in await repo.get_related(bb_entity.id, "creator")}
    bcs_creator_ids = {r.to_entity_id for r in await repo.get_related(bcs_entity.id, "creator")}
    assert vince_gilligan.id in bb_creator_ids
    assert vince_gilligan.id in bcs_creator_ids


async def test_sync_tv_series_genre_override_reuses_existing_genre(db_session, monkeypatch):
    _patch_tmdb(monkeypatch)
    repo = EntityRepository(db_session)
    existing_action = await repo.create_entity(
        entity_type="genre", external_id="28", external_source="tmdb_genre",
        title="Action", slug="action", attributes={},
    )
    await db_session.commit()

    service = SyncService(db_session)
    result = await service.sync_tv_series(1399)
    entity = await repo.get_by_slug(result["slug"])

    genre_edges = await repo.get_related(entity.id, relation_type="has_genre")
    genre_ids = {e.to_entity_id for e in genre_edges}
    assert existing_action.id in genre_ids

    all_action_genres = await repo.get_by_slug("action", entity_type="genre")
    assert all_action_genres.id == existing_action.id


async def test_sync_tv_series_is_idempotent(db_session, monkeypatch):
    _patch_tmdb(monkeypatch)
    service = SyncService(db_session)

    first = await service.sync_tv_series(1396)
    second = await service.sync_tv_series(1396)
    assert first["id"] == second["id"]

    repo = EntityRepository(db_session)
    entity = await repo.get_by_slug(first["slug"])
    cast_edges = await repo.get_related(entity.id, relation_type="acted_in")
    assert len(cast_edges) == 2
