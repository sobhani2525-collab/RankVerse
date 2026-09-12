"""
Tests for pairwise battle voting and Elo scoring.
Run with: pytest tests/test_battles_elo.py
"""
import uuid

from app.modules.battles.elo import expected_score, update_ratings
from app.modules.entities.repository import EntityRepository


# --- Pure Elo math tests (no DB required) ---

def test_expected_score_is_even_for_equal_ratings():
    assert expected_score(1200, 1200) == 0.5


def test_expected_score_favors_higher_rating():
    assert expected_score(1400, 1200) > 0.5
    assert expected_score(1200, 1400) < 0.5


def test_favorite_beating_underdog_gains_little():
    # left is heavily favored and wins - a small ratings change
    new_left, new_right = update_ratings(
        left_rating=1600, right_rating=1200, left_matches=30, right_matches=30, outcome="left"
    )
    assert 1600 < new_left < 1610
    assert 1190 < new_right < 1200


def test_underdog_upset_gains_a_lot():
    # left is a heavy underdog and wins - a large ratings swing
    new_left, new_right = update_ratings(
        left_rating=1200, right_rating=1600, left_matches=30, right_matches=30, outcome="left"
    )
    assert new_left - 1200 > 10
    assert 1600 - new_right > 10


def test_skip_outcome_does_not_change_ratings():
    new_left, new_right = update_ratings(
        left_rating=1250, right_rating=1300, left_matches=5, right_matches=5, outcome="skip"
    )
    assert new_left == 1250
    assert new_right == 1300


def test_provisional_k_factor_produces_bigger_swings_than_established():
    provisional_left, _ = update_ratings(
        left_rating=1200, right_rating=1200, left_matches=0, right_matches=0, outcome="left"
    )
    established_left, _ = update_ratings(
        left_rating=1200, right_rating=1200, left_matches=50, right_matches=50, outcome="left"
    )
    assert (provisional_left - 1200) > (established_left - 1200)


# --- Integration: /battles/vote persists Elo changes ---

async def _create_entity(db_session, entity_type: str, title: str):
    repo = EntityRepository(db_session)
    entity = await repo.create_entity(
        entity_type=entity_type,
        external_id=None,
        external_source=None,
        title=title,
        slug=f"{title.lower().replace(' ', '-')}-{uuid.uuid4().hex[:8]}",
        attributes={},
    )
    await db_session.commit()
    return entity


async def _create_movie(db_session, title: str):
    return await _create_entity(db_session, "movie", title)


async def test_cast_vote_updates_and_persists_elo(client, db_session, auth_headers):
    left = await _create_movie(db_session, "Left Movie")
    right = await _create_movie(db_session, "Right Movie")

    res = await client.post(
        "/api/v1/battles/vote",
        headers=auth_headers,
        json={
            "category": "movie",
            "left_item": str(left.id),
            "right_item": str(right.id),
            "winner": "left",
        },
    )
    assert res.status_code == 201
    body = res.json()
    assert body["left_score_before"] == 1200.0
    assert body["right_score_before"] == 1200.0
    assert body["left_score_after"] > body["left_score_before"]
    assert body["right_score_after"] < body["right_score_before"]

    # a second vote should see the persisted scores from the first as its "before" state
    res2 = await client.post(
        "/api/v1/battles/vote",
        headers=auth_headers,
        json={
            "category": "movie",
            "left_item": str(left.id),
            "right_item": str(right.id),
            "winner": "right",
        },
    )
    assert res2.status_code == 201
    body2 = res2.json()
    assert body2["left_score_before"] == body["left_score_after"]
    assert body2["right_score_before"] == body["right_score_after"]


async def test_cast_vote_rejects_identical_items(client, db_session, auth_headers):
    movie = await _create_movie(db_session, "Solo Movie")

    res = await client.post(
        "/api/v1/battles/vote",
        headers=auth_headers,
        json={
            "category": "movie",
            "left_item": str(movie.id),
            "right_item": str(movie.id),
            "winner": "left",
        },
    )
    assert res.status_code == 422


# --- C2: cast_vote enforces category/entity_type consistency (same-type-only battles) ---

async def test_cast_vote_tv_series_vs_tv_series_succeeds(client, db_session, auth_headers):
    left = await _create_entity(db_session, "tv_series", "Left Show")
    right = await _create_entity(db_session, "tv_series", "Right Show")

    res = await client.post(
        "/api/v1/battles/vote",
        headers=auth_headers,
        json={
            "category": "tv_series",
            "left_item": str(left.id),
            "right_item": str(right.id),
            "winner": "left",
        },
    )
    assert res.status_code == 201


async def test_cast_vote_rejects_cross_type_matchup(client, db_session, auth_headers):
    movie = await _create_entity(db_session, "movie", "A Movie")
    show = await _create_entity(db_session, "tv_series", "A Show")

    res = await client.post(
        "/api/v1/battles/vote",
        headers=auth_headers,
        json={
            "category": "movie",
            "left_item": str(movie.id),
            "right_item": str(show.id),
            "winner": "left",
        },
    )
    assert res.status_code == 400


async def test_cast_vote_rejects_category_not_matching_actual_entity_type(client, db_session, auth_headers):
    left = await _create_movie(db_session, "Left Movie 2")
    right = await _create_movie(db_session, "Right Movie 2")

    # both items are movies, but the declared category says tv_series
    res = await client.post(
        "/api/v1/battles/vote",
        headers=auth_headers,
        json={
            "category": "tv_series",
            "left_item": str(left.id),
            "right_item": str(right.id),
            "winner": "left",
        },
    )
    assert res.status_code == 400


async def test_get_next_battle_matches_within_tv_series_only(client, db_session, auth_headers):
    await _create_entity(db_session, "tv_series", "Show One")
    await _create_entity(db_session, "tv_series", "Show Two")
    await _create_entity(db_session, "movie", "Unrelated Movie")

    res = await client.get("/api/v1/battles/next", params={"category": "tv_series"}, headers=auth_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["category"] == "tv_series"
    assert body["left"]["title"] in {"Show One", "Show Two"}
    assert body["right"]["title"] in {"Show One", "Show Two"}
    assert body["left"]["title"] != body["right"]["title"]


async def test_cast_vote_rejects_nonexistent_entity(client, db_session, auth_headers):
    movie = await _create_movie(db_session, "Real Movie")

    res = await client.post(
        "/api/v1/battles/vote",
        headers=auth_headers,
        json={
            "category": "movie",
            "left_item": str(movie.id),
            "right_item": str(uuid.uuid4()),
            "winner": "left",
        },
    )
    assert res.status_code == 404
