"""
Tests for GET /movies|tv-series/{slug}/suggested-battle (SuggestedBattleService)
and the pre-selected-pair support on GET /battles/next.

Run with: TEST_DATABASE_URL=... pytest tests/test_suggested_battle.py
"""
import uuid

from app.modules.entities.models import EntityRanking
from app.modules.entities.repository import EntityRepository
from app.modules.taste.repository import TasteRepository


async def _create_entity(entity_repo, entity_type: str, title: str, slug: str):
    return await entity_repo.create_entity(
        entity_type=entity_type, external_id=None, external_source=None,
        title=title, slug=slug, attributes={"poster_path": "/x.jpg"},
    )


async def _set_score(db_session, entity_id, computed_score: float):
    db_session.add(EntityRanking(entity_id=entity_id, computed_score=computed_score, total_votes=10))
    await db_session.flush()


async def test_suggested_battle_is_null_for_guest(client, db_session):
    entity_repo = EntityRepository(db_session)
    movie = await _create_entity(entity_repo, "movie", "Guest Movie", "guest-movie-sbt")
    await db_session.commit()

    res = await client.get(f"/api/v1/movies/{movie.slug}/suggested-battle")
    assert res.status_code == 200
    assert res.json()["data"] is None


async def test_suggested_battle_is_null_without_anchors(client, db_session, test_user, auth_headers):
    entity_repo = EntityRepository(db_session)
    movie = await _create_entity(entity_repo, "movie", "Anchorless Movie", "anchorless-movie-sbt")
    await db_session.commit()

    res = await client.get(f"/api/v1/movies/{movie.slug}/suggested-battle", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["data"] is None


async def test_suggested_battle_prefers_genre_overlapping_anchor(
    client, db_session, test_user, auth_headers
):
    entity_repo = EntityRepository(db_session)
    taste_repo = TasteRepository(db_session)

    drama = await _create_entity(entity_repo, "genre", "Drama", "drama-sbt")
    comedy = await _create_entity(entity_repo, "genre", "Comedy", "comedy-sbt")

    current_movie = await _create_entity(entity_repo, "movie", "Current Movie", "current-movie-sbt")
    drama_anchor = await _create_entity(entity_repo, "movie", "Drama Anchor", "drama-anchor-sbt")
    comedy_anchor = await _create_entity(entity_repo, "movie", "Comedy Anchor", "comedy-anchor-sbt")
    tv_anchor = await _create_entity(entity_repo, "tv_series", "TV Anchor", "tv-anchor-sbt")
    await db_session.commit()

    await entity_repo.create_relationship(current_movie.id, drama.id, "has_genre")
    await entity_repo.create_relationship(drama_anchor.id, drama.id, "has_genre")
    await entity_repo.create_relationship(comedy_anchor.id, comedy.id, "has_genre")
    await db_session.commit()

    for entity, score in ((current_movie, 7.5), (drama_anchor, 8.5), (comedy_anchor, 8.0), (tv_anchor, 9.0)):
        await _set_score(db_session, entity.id, score)
    await db_session.commit()

    # comedy_anchor ranks strongest (rank=1) but doesn't share a genre with
    # current_movie; drama_anchor is weaker (rank=2) but does. tv_anchor is
    # the wrong entity_type entirely and must never be picked.
    await taste_repo.bulk_upsert_anchors(
        test_user.id,
        [
            {"entity_id": comedy_anchor.id, "anchor_strength": "primary", "match_score": 90.0, "rank": 1},
            {"entity_id": drama_anchor.id, "anchor_strength": "strong_signal", "match_score": 80.0, "rank": 2},
            {"entity_id": tv_anchor.id, "anchor_strength": "strong_signal", "match_score": 95.0, "rank": 3},
        ],
    )
    await db_session.commit()

    res = await client.get(f"/api/v1/movies/{current_movie.slug}/suggested-battle", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["category"] == "movie"
    slugs = {data["left"]["slug"], data["right"]["slug"]}
    assert slugs == {drama_anchor.slug, current_movie.slug}
    assert data["right"]["slug"] == current_movie.slug


async def test_suggested_battle_falls_back_to_strongest_anchor_without_genre_overlap(
    client, db_session, test_user, auth_headers
):
    entity_repo = EntityRepository(db_session)
    taste_repo = TasteRepository(db_session)

    drama = await _create_entity(entity_repo, "genre", "Drama", "drama-sbt-2")
    comedy = await _create_entity(entity_repo, "genre", "Comedy", "comedy-sbt-2")

    current_movie = await _create_entity(entity_repo, "movie", "Current Movie 2", "current-movie-sbt-2")
    comedy_anchor = await _create_entity(entity_repo, "movie", "Comedy Anchor 2", "comedy-anchor-sbt-2")
    await db_session.commit()

    await entity_repo.create_relationship(current_movie.id, drama.id, "has_genre")
    await entity_repo.create_relationship(comedy_anchor.id, comedy.id, "has_genre")
    await db_session.commit()

    for entity, score in ((current_movie, 7.0), (comedy_anchor, 8.0)):
        await _set_score(db_session, entity.id, score)
    await db_session.commit()

    await taste_repo.bulk_upsert_anchors(
        test_user.id,
        [{"entity_id": comedy_anchor.id, "anchor_strength": "primary", "match_score": 90.0, "rank": 1}],
    )
    await db_session.commit()

    res = await client.get(f"/api/v1/movies/{current_movie.slug}/suggested-battle", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()["data"]
    slugs = {data["left"]["slug"], data["right"]["slug"]}
    assert slugs == {comedy_anchor.slug, current_movie.slug}


async def test_battles_next_accepts_preselected_pair(client, db_session, auth_headers):
    entity_repo = EntityRepository(db_session)
    left = await _create_entity(entity_repo, "movie", "Preselected Left", "preselected-left")
    right = await _create_entity(entity_repo, "movie", "Preselected Right", "preselected-right")
    await db_session.commit()

    res = await client.get(
        f"/api/v1/battles/next?category=movie&left_id={left.id}&right_id={right.id}",
        headers=auth_headers,
    )
    assert res.status_code == 200
    body = res.json()
    assert body["left"]["id"] == str(left.id)
    assert body["right"]["id"] == str(right.id)


async def test_battles_next_preselected_pair_rejects_mixed_types(client, db_session, auth_headers):
    entity_repo = EntityRepository(db_session)
    movie = await _create_entity(entity_repo, "movie", "Mixed Movie", "mixed-movie-sbt")
    show = await _create_entity(entity_repo, "tv_series", "Mixed Show", "mixed-show-sbt")
    await db_session.commit()

    res = await client.get(
        f"/api/v1/battles/next?category=movie&left_id={movie.id}&right_id={show.id}",
        headers=auth_headers,
    )
    assert res.status_code == 400
