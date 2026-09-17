"""
Integration tests for SyncService.bulk_sync_iranian, run against a real
Postgres db_session with TMDbClient's discover_movies/discover_tv/get_movie/
get_tv_series monkeypatched -- no live TMDb network access required.

bulk_sync_iranian queries TMDb's /discover/movie and /discover/tv twice each
(once with with_origin_country="IR", once with with_original_language="fa")
because TMDb ANDs all discover filters together rather than OR-ing them; a
title can show up in either query, or both, and must only be synced once.

Run with: TEST_DATABASE_URL=... pytest tests/test_sync_iranian.py
"""
from app.modules.entities.repository import EntityRepository
from app.modules.sync.service import SyncService
from app.modules.sync.tmdb_client import TMDbClient

A_SEPARATION = {
    "id": 100,
    "title": "A Separation",
    "overview": "A married couple are faced with a difficult decision to improve their child's life.",
    "poster_path": "/dHQyBqxNaqTGqIjENAmwWyPCQNC.jpg",
    "release_date": "2011-03-16",
    "vote_average": 8.0,
    "vote_count": 3400,
    "production_countries": [{"iso_3166_1": "IR", "name": "Iran"}],
    "genres": [{"id": 18, "name": "Drama"}],
    "credits": {
        "cast": [{"id": 501, "name": "Peyman Moaadi", "character": "Nader", "order": 0}],
        "crew": [{"id": 502, "name": "Asghar Farhadi", "job": "Director"}],
    },
}

THE_SALESMAN = {
    "id": 200,
    "title": "The Salesman",
    "overview": "A couple's relationship comes under a strain after an incident.",
    "poster_path": "/eGiCPKAMZQnpCX9GgKUxfDpjHtn.jpg",
    "release_date": "2016-05-21",
    "vote_average": 7.7,
    "vote_count": 1600,
    "production_countries": [{"iso_3166_1": "IR", "name": "Iran"}],
    "genres": [{"id": 18, "name": "Drama"}],
    "credits": {
        "cast": [{"id": 503, "name": "Shahab Hosseini", "character": "Emad", "order": 0}],
        "crew": [{"id": 502, "name": "Asghar Farhadi", "job": "Director"}],
    },
}

BROKEN_FIXTURE_MOVIE_ID = 900  # deliberately missing from MOVIES_BY_ID to exercise the skip-on-error path

MOVIES_BY_ID = {100: A_SEPARATION, 200: THE_SALESMAN}

SHAHRZAD = {
    "id": 300,
    "name": "Shahrzad",
    "overview": "A love story set in 1950s Iran against a backdrop of political turmoil.",
    "poster_path": "/8k1v3sYalRW0hBgkbUbYzKrLGeu.jpg",
    "first_air_date": "2015-12-25",
    "last_air_date": "2018-01-01",
    "number_of_seasons": 3,
    "number_of_episodes": 45,
    "status": "Ended",
    "vote_average": 8.4,
    "vote_count": 300,
    "origin_country": ["IR"],
    "genres": [{"id": 18, "name": "Drama"}],
    "created_by": [{"id": 601, "name": "Hassan Fathi"}],
    "networks": [],
    "credits": {
        "cast": [{"id": 602, "name": "Taraneh Alidoosti", "character": "Shahrzad", "order": 0}],
        "crew": [],
    },
}

TV_BY_ID = {300: SHAHRZAD}


def _patch_tmdb(monkeypatch, movie_country_ids, movie_language_ids, tv_country_ids=(), tv_language_ids=()):
    async def fake_discover_movies(self, page=1, sort_by="popularity.desc",
                                    with_origin_country=None, with_original_language=None):
        if with_origin_country == "IR":
            return {"results": [{"id": i} for i in movie_country_ids]}
        if with_original_language == "fa":
            return {"results": [{"id": i} for i in movie_language_ids]}
        return {"results": []}

    async def fake_discover_tv(self, page=1, sort_by="popularity.desc",
                                with_origin_country=None, with_original_language=None):
        if with_origin_country == "IR":
            return {"results": [{"id": i} for i in tv_country_ids]}
        if with_original_language == "fa":
            return {"results": [{"id": i} for i in tv_language_ids]}
        return {"results": []}

    async def fake_get_movie(self, tmdb_id: int, language: str = "en-US") -> dict:
        return MOVIES_BY_ID[tmdb_id]

    async def fake_get_tv_series(self, tmdb_id: int, language: str = "en-US") -> dict:
        return TV_BY_ID[tmdb_id]

    monkeypatch.setattr(TMDbClient, "discover_movies", fake_discover_movies)
    monkeypatch.setattr(TMDbClient, "discover_tv", fake_discover_tv)
    monkeypatch.setattr(TMDbClient, "get_movie", fake_get_movie)
    monkeypatch.setattr(TMDbClient, "get_tv_series", fake_get_tv_series)


async def test_bulk_sync_iranian_dedupes_title_found_by_both_filters(db_session, monkeypatch):
    # "A Separation" (100) shows up in both the origin_country=IR and the
    # original_language=fa discover results -- it must only be synced once.
    _patch_tmdb(monkeypatch, movie_country_ids=[100], movie_language_ids=[100])
    service = SyncService(db_session)

    synced = await service.bulk_sync_iranian(pages=1)

    assert synced == 1
    repo = EntityRepository(db_session)
    entity = await repo.get_by_external_id("tmdb", "100")
    assert entity is not None
    assert entity.title == "A Separation"


async def test_bulk_sync_iranian_syncs_movies_and_tv_series_from_either_filter(db_session, monkeypatch):
    # 200 ("The Salesman") only shows up under original_language=fa (not
    # origin_country=IR here), and 300 ("Shahrzad") only under
    # tv's origin_country=IR -- both must still get synced.
    _patch_tmdb(
        monkeypatch,
        movie_country_ids=[],
        movie_language_ids=[200],
        tv_country_ids=[300],
        tv_language_ids=[],
    )
    service = SyncService(db_session)

    synced = await service.bulk_sync_iranian(pages=1)

    assert synced == 2
    repo = EntityRepository(db_session)
    movie = await repo.get_by_external_id("tmdb", "200")
    series = await repo.get_by_external_id("tmdb", "300")
    assert movie is not None and movie.entity_type == "movie"
    assert series is not None and series.entity_type == "tv_series"


async def test_bulk_sync_iranian_skips_failing_item_and_continues(db_session, monkeypatch):
    # BROKEN_FIXTURE_MOVIE_ID isn't in MOVIES_BY_ID, so get_movie raises a
    # KeyError for it -- bulk_sync_iranian must log/skip it (rolling back
    # any partial work) and still sync the other, valid item.
    _patch_tmdb(
        monkeypatch,
        movie_country_ids=[BROKEN_FIXTURE_MOVIE_ID, 100],
        movie_language_ids=[],
    )
    service = SyncService(db_session)

    synced = await service.bulk_sync_iranian(pages=1)

    assert synced == 1
    repo = EntityRepository(db_session)
    assert (await repo.get_by_external_id("tmdb", "100")) is not None
    assert (await repo.get_by_external_id("tmdb", str(BROKEN_FIXTURE_MOVIE_ID))) is None
