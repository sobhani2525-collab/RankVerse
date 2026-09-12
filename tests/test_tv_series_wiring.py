"""
Backend wiring for tv_series across ranking, battles, and recommendations --
these layers were built and tested against entity_type="movie" only; this
file exercises the same logic with entity_type="tv_series" to confirm each
layer either already generalizes cleanly or was fixed to.

Run with: TEST_DATABASE_URL=... pytest tests/test_tv_series_wiring.py
"""
import uuid

import pytest
from sqlalchemy import select, text

from app.modules.entities.models import RelationshipEdge
from app.modules.entities.repository import EntityRepository
from app.modules.ranking.service import RankingService
from app.modules.sync.service import SyncService
from app.modules.sync.tmdb_client import TMDbClient
from app.modules.users.repository import UserRepository
from app.modules.users.service import UserService
from scripts.build_similarity_graph import CLEAR_OLD_SQL, COMPUTE_SIMILARITY_SQL
from tests.test_sync_tv_series import BETTER_CALL_SAUL, BREAKING_BAD


async def _make_tv_series(repo: EntityRepository, slug: str, title: str, score: float | None = None):
    entity = await repo.create_entity(
        entity_type="tv_series", external_id=None, external_source=None,
        title=title, slug=slug, attributes={},
    )
    if score is not None:
        from app.modules.entities.models import EntityRanking
        ranking = EntityRanking(entity_id=entity.id, computed_score=score, total_votes=10)
        repo.db.add(ranking)
        await repo.db.flush()
    return entity


# --- B1: EntityRepository.list_movies / EntityService.list_tv_series ---

async def test_list_movies_entity_type_param_filters_tv_series(db_session):
    repo = EntityRepository(db_session)
    await _make_tv_series(repo, "got-2011", "Game of Thrones", score=9.0)
    await repo.create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Some Movie", slug="some-movie", attributes={},
    )
    await db_session.commit()

    tv_entities, tv_total = await repo.list_movies(entity_type="tv_series")
    assert tv_total == 1
    assert tv_entities[0].slug == "got-2011"

    movie_entities, movie_total = await repo.list_movies(entity_type="movie")
    assert movie_total == 1
    assert movie_entities[0].slug == "some-movie"


async def test_entity_service_list_tv_series(db_session):
    from app.modules.entities.service import EntityService

    repo = EntityRepository(db_session)
    await _make_tv_series(repo, "bb-2008", "Breaking Bad", score=9.5)
    await db_session.commit()

    service = EntityService(db_session)
    items, total = await service.list_tv_series()
    assert total == 1
    assert items[0].slug == "bb-2008"
    assert items[0].title == "Breaking Bad"
    assert items[0].entity_type == "tv_series"  # lets the frontend route mixed lists correctly


# --- B3: RankingService.recompute_all already accepts entity_type ---

async def test_recompute_all_recomputes_tv_series_only(db_session):
    repo = EntityRepository(db_session)
    tv = await _make_tv_series(repo, "bcs-2015", "Better Call Saul")
    movie = await repo.create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Untouched Movie", slug="untouched-movie", attributes={},
    )
    await db_session.commit()

    service = RankingService(db_session)
    count = await service.recompute_all(entity_type="tv_series")
    assert count == 1

    from app.modules.entities.models import EntityRanking
    tv_ranking = await db_session.get(EntityRanking, tv.id)
    movie_ranking = await db_session.get(EntityRanking, movie.id)
    assert tv_ranking is not None and tv_ranking.computed_score is not None
    assert movie_ranking is None  # untouched -- recompute_all scoped to tv_series only


# --- A1/A2: rating a tv_series via UserService and the /tv-series/{slug}/rate route ---

async def test_rate_tv_series_via_service(db_session, test_user):
    repo = EntityRepository(db_session)
    tv = await _make_tv_series(repo, "bb-rate-2008", "Breaking Bad")
    await db_session.commit()

    service = UserService(db_session)
    rating = await service.rate_tv_series(test_user.id, "bb-rate-2008", 9)
    assert rating.score == 9

    stored = await UserRepository(db_session).get_rating(test_user.id, tv.id)
    assert stored is not None and stored.score == 9

    deleted = await service.unrate_tv_series(test_user.id, "bb-rate-2008")
    assert deleted is True
    assert await UserRepository(db_session).get_rating(test_user.id, tv.id) is None


async def test_rate_movie_lookup_rejects_tv_series_slug(db_session, test_user):
    """rate_movie must stay movie-only -- a tv_series slug should 404, not silently rate it."""
    from app.core.exceptions import NotFoundError

    repo = EntityRepository(db_session)
    await _make_tv_series(repo, "not-a-movie-2020", "Not A Movie")
    await db_session.commit()

    service = UserService(db_session)
    try:
        await service.rate_movie(test_user.id, "not-a-movie-2020", 8)
        assert False, "expected NotFoundError"
    except NotFoundError:
        pass


async def test_rate_tv_series_via_api(client, db_session, auth_headers):
    repo = EntityRepository(db_session)
    await _make_tv_series(repo, "got-rate-2011", "Game of Thrones")
    await db_session.commit()

    res = await client.post(
        "/api/v1/tv-series/got-rate-2011/rate", headers=auth_headers, json={"score": 10}
    )
    assert res.status_code == 200
    assert res.json()["data"]["score"] == 10

    res2 = await client.delete("/api/v1/tv-series/got-rate-2011/rate", headers=auth_headers)
    assert res2.status_code == 200
    assert res2.json()["data"]["deleted"] is True


# --- B2: ranking routes for tv_series ---

async def test_top_tv_series_ranking_route(client, db_session):
    repo = EntityRepository(db_session)
    await _make_tv_series(repo, "top-tv-1", "Top Show", score=9.2)
    await db_session.commit()

    res = await client.get("/api/v1/rankings/tv-series")
    assert res.status_code == 200
    slugs = [i["slug"] for i in res.json()["data"]]
    assert "top-tv-1" in slugs


async def test_tv_series_ranking_highlights_route(client, db_session):
    repo = EntityRepository(db_session)
    show = await _make_tv_series(repo, "highlight-tv-1", "Highlight Show", score=8.0)
    genre = await repo.create_entity(
        entity_type="genre", external_id=None, external_source=None,
        title="Drama", slug="drama-highlight-test", attributes={},
    )
    await repo.create_relationship(show.id, genre.id, "has_genre")
    await db_session.commit()

    res = await client.get("/api/v1/tv-series/highlight-tv-1/rankings")
    assert res.status_code == 200


async def test_tv_series_ranking_highlights_404_for_missing_slug(client):
    res = await client.get("/api/v1/tv-series/does-not-exist/rankings")
    assert res.status_code == 404


# --- F2: genre detail includes tv_series alongside movies ---

async def test_genre_detail_includes_both_movies_and_tv_series(client, db_session):
    from app.modules.entities.service import EntityService

    repo = EntityRepository(db_session)
    genre = await repo.create_entity(
        entity_type="genre", external_id=None, external_source=None,
        title="Crime", slug="crime-genre-test", attributes={},
    )
    movie = await repo.create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Crime Movie", slug="crime-movie-test", attributes={},
    )
    tv = await _make_tv_series(repo, "crime-tv-test", "Crime Show")
    await repo.create_relationship(movie.id, genre.id, "has_genre")
    await repo.create_relationship(tv.id, genre.id, "has_genre")
    await db_session.commit()

    service = EntityService(db_session)
    detail = await service.get_genre_detail("crime-genre-test")
    assert [m.slug for m in detail.movies] == ["crime-movie-test"]
    assert [t.slug for t in detail.tv_series] == ["crime-tv-test"]


# --- D2: 'creator' edges count toward similarity (build_similarity_graph.py) ---

async def _run_similarity_graph(db_session):
    await db_session.execute(text(CLEAR_OLD_SQL))
    await db_session.execute(text(COMPUTE_SIMILARITY_SQL))
    await db_session.commit()


async def _similar_to_edge(db_session, from_id, to_id) -> RelationshipEdge | None:
    stmt = select(RelationshipEdge).where(
        RelationshipEdge.from_entity_id == from_id,
        RelationshipEdge.to_entity_id == to_id,
        RelationshipEdge.relation_type == "similar_to",
    )
    return (await db_session.execute(stmt)).scalar_one_or_none()


async def test_shared_creator_alone_is_not_enough_but_creator_plus_genre_is(db_session):
    """
    Isolates the D2 fix: a single shared 'creator' edge alone still can't
    clear the "at least 2 distinct shared edges" bar on its own (by design,
    same as a single shared genre never could) -- but a shared creator
    PLUS one shared genre must now count as 2 distinct signals and produce
    a similar_to edge. Before the fix, 'creator' wasn't in the formula at
    all, so this same setup (1 genre + 1 uncounted creator) would have
    looked like just 1 shared edge and never cleared the threshold.
    """
    repo = EntityRepository(db_session)
    show_a = await repo.create_entity(
        entity_type="tv_series", external_id=None, external_source=None,
        title="Show A", slug="show-a-creator-test", attributes={},
    )
    show_b = await repo.create_entity(
        entity_type="tv_series", external_id=None, external_source=None,
        title="Show B", slug="show-b-creator-test", attributes={},
    )
    creator = await repo.create_entity(
        entity_type="person", external_id=None, external_source=None,
        title="Shared Creator", slug="shared-creator-test", attributes={},
    )
    genre = await repo.create_entity(
        entity_type="genre", external_id=None, external_source=None,
        title="Drama", slug="drama-creator-test", attributes={},
    )
    await repo.create_relationship(show_a.id, creator.id, "creator")
    await repo.create_relationship(show_b.id, creator.id, "creator")
    await repo.create_relationship(show_a.id, genre.id, "has_genre")
    await repo.create_relationship(show_b.id, genre.id, "has_genre")
    await db_session.commit()

    await _run_similarity_graph(db_session)

    edge = await _similar_to_edge(db_session, show_a.id, show_b.id)
    assert edge is not None
    assert edge.weight == pytest.approx(0.55 + 0.08)  # creator + has_genre


async def test_breaking_bad_and_better_call_saul_get_similar_to_edge(db_session):
    """
    End-to-end: sync the real BB/BCS fixtures (shared creator Vince Gilligan,
    shared genres Crime+Drama, shared cast Jonathan Banks), then confirm
    build_similarity_graph.py links them -- the concrete case reported live.
    """
    async def fake_get_tv_series(self, tmdb_id):
        return {1396: BREAKING_BAD, 60059: BETTER_CALL_SAUL}[tmdb_id]

    TMDbClient.get_tv_series = fake_get_tv_series

    service = SyncService(db_session)
    bb = await service.sync_tv_series(1396)
    bcs = await service.sync_tv_series(60059)

    await _run_similarity_graph(db_session)

    edge = await _similar_to_edge(db_session, uuid.UUID(bb["id"]), uuid.UUID(bcs["id"]))
    assert edge is not None
    # creator (0.55) + has_genre x2 (0.08 each) + acted_in x1 (0.15) = 0.86
    assert edge.weight == pytest.approx(0.86)


# --- D1/D3: recommendations are cross-type by design (no same-entity_type filter) ---

async def test_related_endpoint_recommends_across_entity_types(client, db_session):
    """
    /entities/{id}/related has no entity_type filter anywhere in its query
    path (router -> get_related -> get_shared_connections) -- a movie CAN
    recommend a tv_series and vice versa, as long as a similar_to edge
    connects them. This is a deliberate product decision (the shared-graph
    payoff: "recommended because both were made by the same director/
    creator" is exactly as meaningful across movie/tv_series as within one
    type), not an oversight, so this test pins the behavior against a
    future change accidentally scoping it to same-type-only.
    """
    repo = EntityRepository(db_session)
    movie = await repo.create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="El Camino", slug="el-camino-cross-type-test", attributes={},
    )
    show = await repo.create_entity(
        entity_type="tv_series", external_id=None, external_source=None,
        title="Breaking Bad", slug="breaking-bad-cross-type-test", attributes={},
    )
    director = await repo.create_entity(
        entity_type="person", external_id=None, external_source=None,
        title="Vince Gilligan", slug="vince-gilligan-cross-type-test", attributes={},
    )
    await repo.create_relationship(movie.id, director.id, "directed_by")
    await repo.create_relationship(show.id, director.id, "creator")
    await repo.create_relationship(movie.id, show.id, "similar_to", weight=0.9)
    await db_session.commit()

    res = await client.get(f"/api/v1/entities/{movie.id}/related")
    assert res.status_code == 200
    related = res.json()["data"]
    assert len(related) == 1
    assert related[0]["slug"] == "breaking-bad-cross-type-test"
    # entity_type on each related item is what lets the frontend route a
    # cross-type recommendation correctly (/movies/x vs /tv-series/x)
    assert related[0]["entity_type"] == "tv_series"


async def test_similarity_graph_creates_cross_type_edge_from_shared_genre_and_cast(db_session):
    """Confirms D1: build_similarity_graph.py's self-join has no entity_type
    filter, so a movie and a tv_series sharing enough edges (2 genres +
    1 cast member here, clearing both the >=2-edges and >=0.25-weight bars)
    get linked automatically, exactly like two movies would."""
    repo = EntityRepository(db_session)
    movie = await repo.create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Sicario", slug="sicario-cross-type-test", attributes={},
    )
    show = await repo.create_entity(
        entity_type="tv_series", external_id=None, external_source=None,
        title="Breaking Bad 2", slug="breaking-bad-2-cross-type-test", attributes={},
    )
    crime = await repo.create_entity(
        entity_type="genre", external_id=None, external_source=None,
        title="Crime", slug="crime-cross-type-test", attributes={},
    )
    drama = await repo.create_entity(
        entity_type="genre", external_id=None, external_source=None,
        title="Drama", slug="drama-cross-type-test", attributes={},
    )
    actor = await repo.create_entity(
        entity_type="person", external_id=None, external_source=None,
        title="Shared Actor", slug="shared-actor-cross-type-test", attributes={},
    )
    await repo.create_relationship(movie.id, crime.id, "has_genre")
    await repo.create_relationship(movie.id, drama.id, "has_genre")
    await repo.create_relationship(show.id, crime.id, "has_genre")
    await repo.create_relationship(show.id, drama.id, "has_genre")
    await repo.create_relationship(movie.id, actor.id, "acted_in")
    await repo.create_relationship(show.id, actor.id, "acted_in")
    await db_session.commit()

    await _run_similarity_graph(db_session)

    edge = await _similar_to_edge(db_session, movie.id, show.id)
    assert edge is not None
    assert edge.weight == pytest.approx(0.31)  # 2 x has_genre (0.08) + 1 x acted_in (0.15)
