"""
Tests for GET /users/me/predicted-picks (PredictedPicksService).

Run with: TEST_DATABASE_URL=... pytest tests/test_predicted_picks.py
"""
from uuid import UUID

import pytest

from app.modules.entities.models import EntityRanking
from app.modules.entities.repository import EntityRepository
from app.modules.taste.predicted_picks import favorite_genre_scores
from app.modules.taste.repository import TasteRepository
from app.modules.users.repository import UserRepository


async def _create_entity(entity_repo, entity_type: str, title: str, slug: str):
    return await entity_repo.create_entity(
        entity_type=entity_type, external_id=None, external_source=None,
        title=title, slug=slug, attributes={"poster_path": "/x.jpg"},
    )


async def _set_score(db_session, entity_id, computed_score: float):
    db_session.add(EntityRanking(entity_id=entity_id, computed_score=computed_score, total_votes=10))
    await db_session.flush()


def test_repeated_specific_favorites_outweigh_generic_overlap():
    ids = [UUID(int=i) for i in range(1, 5)]
    signals = tuple((title, "movie", "drama") for title in ids) + (
        (ids[0], "movie", "animation"),
        (ids[1], "movie", "animation"),
        (ids[2], "movie", "music"),
        (ids[3], "movie", "music"),
        (ids[3], "movie", "family"),
        (ids[3], "movie", "family"),
    )
    scores = favorite_genre_scores(signals)
    assert scores["animation"] == scores["music"] > scores["drama"]
    assert scores["family"] == 65


async def test_animation_and_music_favorites_beat_higher_ranked_generic_drama(
    client, db_session, test_user, auth_headers,
):
    entities = EntityRepository(db_session)
    users = UserRepository(db_session)
    genres = {
        slug: await _create_entity(entities, "genre", slug, slug)
        for slug in ("animation", "music", "drama")
    }
    for index, taste in enumerate(("animation", "animation", "music", "music")):
        title = await _create_entity(entities, "movie", f"Liked {index}", f"liked-affinity-{index}")
        for slug in (taste, "drama"):
            await entities.create_relationship(title.id, genres[slug].id, "has_genre")
        await users.add_favorite(test_user.id, title.id)

    for slug, kind, score, tags in (
        ("animated-musical", "movie", 7.0, ("animation", "music")),
        ("music-biopic", "movie", 7.5, ("music", "drama")),
        ("animated-film", "movie", 7.0, ("animation",)),
        ("popular-drama", "tv_series", 9.9, ("drama",)),
    ):
        title = await _create_entity(entities, kind, slug, slug)
        for tag in tags:
            await entities.create_relationship(title.id, genres[tag].id, "has_genre")
        await _set_score(db_session, title.id, score)
    await db_session.commit()

    response = await client.get("/api/v1/users/me/predicted-picks", headers=auth_headers)
    assert response.status_code == 200
    recommendations = response.json()["data"]
    assert recommendations[0]["entity"]["slug"] == "animated-musical"
    assert {pick["entity"]["slug"] for pick in recommendations} == {
        "animated-musical", "music-biopic", "animated-film",
    }


async def test_empty_state_with_no_qualifying_dimensions(client, db_session, test_user, auth_headers):
    res = await client.get("/api/v1/users/me/predicted-picks", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["data"] == []


@pytest.mark.parametrize("liked_type", ["movie", "tv_series"])
async def test_a_like_immediately_suggests_other_titles_without_taste_dimensions(
    client, db_session, test_user, auth_headers, liked_type,
):
    entities = EntityRepository(db_session)
    users = UserRepository(db_session)
    genre = await _create_entity(entities, "genre", "Mystery", "live-like-mystery")
    liked = await _create_entity(entities, liked_type, "Liked Title", "live-liked-title")
    similar = await _create_entity(entities, "movie", "Similar Title", "live-similar-title")
    for title in (liked, similar):
        await entities.create_relationship(title.id, genre.id, "has_genre")
        await _set_score(db_session, title.id, 9.0)
    await db_session.commit()

    async def picks():
        response = await client.get("/api/v1/users/me/predicted-picks", headers=auth_headers)
        assert response.status_code == 200
        return response.json()["data"]

    assert await picks() == []
    favorite = await users.add_favorite(test_user.id, liked.id)
    await db_session.commit()
    recommendations = await picks()
    assert [pick["entity"]["slug"] for pick in recommendations] == [similar.slug]
    assert recommendations[0]["reason_genres"] == [genre.slug]

    await users.remove_favorite(favorite)
    await db_session.commit()
    assert await picks() == []


async def test_predicted_picks_ranks_by_match_score_and_excludes_rated(
    client, db_session, test_user, auth_headers
):
    entity_repo = EntityRepository(db_session)
    taste_repo = TasteRepository(db_session)

    drama = await _create_entity(entity_repo, "genre", "Drama", "drama-predicted-test")
    comedy = await _create_entity(entity_repo, "genre", "Comedy", "comedy-predicted-test")

    high_scoring = await _create_entity(entity_repo, "movie", "High Scoring Drama", "high-scoring-drama-ppt")
    low_scoring = await _create_entity(entity_repo, "movie", "Low Scoring Drama", "low-scoring-drama-ppt")
    already_rated = await _create_entity(entity_repo, "movie", "Already Rated Drama", "already-rated-drama-ppt")
    wrong_genre = await _create_entity(entity_repo, "movie", "Comedy Movie", "comedy-movie-ppt")
    tv_candidate = await _create_entity(entity_repo, "tv_series", "Drama Show", "drama-show-ppt")
    await db_session.commit()

    for movie in (high_scoring, low_scoring, already_rated, tv_candidate):
        await entity_repo.create_relationship(movie.id, drama.id, "has_genre")
    await entity_repo.create_relationship(wrong_genre.id, comedy.id, "has_genre")
    await db_session.commit()

    await _set_score(db_session, high_scoring.id, 9.0)
    await _set_score(db_session, low_scoring.id, 5.0)
    await _set_score(db_session, already_rated.id, 9.5)
    await _set_score(db_session, wrong_genre.id, 9.9)
    await _set_score(db_session, tv_candidate.id, 8.0)
    await db_session.commit()

    await taste_repo.bulk_upsert_dimensions(
        test_user.id, "genre",
        [{"dimension_key": "drama-predicted-test", "score": 80.0, "confidence": 0.6, "sample_size": 12}],
    )
    await db_session.commit()

    # Mark one qualifying-genre movie as already rated -- it must not be
    # suggested even though it'd otherwise match and score well. Seeded
    # directly (not via POST /rate) so the real dimension-recompute
    # cascade that endpoint triggers doesn't overwrite the manually
    # seeded dimension above with one built from just this single rating.
    await UserRepository(db_session).upsert_rating(test_user.id, already_rated.id, 5)
    await db_session.commit()

    res = await client.get("/api/v1/users/me/predicted-picks", headers=auth_headers)
    assert res.status_code == 200
    picks = res.json()["data"]

    slugs = [p["entity"]["slug"] for p in picks]
    assert already_rated.slug not in slugs
    assert wrong_genre.slug not in slugs  # doesn't match the qualifying genre
    assert high_scoring.slug in slugs
    assert tv_candidate.slug in slugs  # tv_series is a valid candidate type

    # Higher computed_score among equally-matched genres should rank higher.
    assert slugs.index(high_scoring.slug) < slugs.index(low_scoring.slug)

    # match_score = 0.85 * dimension_match(80) + 0.15 * (computed_score * 10)
    high_pick = next(p for p in picks if p["entity"]["slug"] == high_scoring.slug)
    assert high_pick["match_score"] == 81.5  # 0.85*80 + 0.15*90


async def test_predicted_picks_respects_limit(client, db_session, test_user, auth_headers):
    entity_repo = EntityRepository(db_session)
    taste_repo = TasteRepository(db_session)

    drama = await _create_entity(entity_repo, "genre", "Drama", "drama-limit-test")
    for i in range(5):
        movie = await _create_entity(entity_repo, "movie", f"Limit Movie {i}", f"limit-movie-{i}-ppt")
        await db_session.commit()
        await entity_repo.create_relationship(movie.id, drama.id, "has_genre")
        await db_session.commit()
        await _set_score(db_session, movie.id, 7.0 + i * 0.1)
        await db_session.commit()

    await taste_repo.bulk_upsert_dimensions(
        test_user.id, "genre",
        [{"dimension_key": "drama-limit-test", "score": 70.0, "confidence": 0.6, "sample_size": 12}],
    )
    await db_session.commit()

    res = await client.get("/api/v1/users/me/predicted-picks", headers=auth_headers)
    assert len(res.json()["data"]) == 3  # default limit

    res = await client.get("/api/v1/users/me/predicted-picks?limit=5", headers=auth_headers)
    assert len(res.json()["data"]) == 5
