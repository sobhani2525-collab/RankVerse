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


async def test_suggested_battle_prefers_similar_to_anchor(
    client, db_session, test_user, auth_headers
):
    """
    similar_to edges (see scripts/build_similarity_graph.py) require at
    least 2 shared connections and a minimum composite weight, so they're
    the gate here instead of a single shared genre -- a lone shared genre
    like "Drama" isn't enough evidence two titles are actually comparable
    (see test_suggested_battle_is_null_without_similar_to).
    """
    entity_repo = EntityRepository(db_session)
    taste_repo = TasteRepository(db_session)

    current_movie = await _create_entity(entity_repo, "movie", "Current Movie", "current-movie-sbt")
    similar_anchor = await _create_entity(entity_repo, "movie", "Similar Anchor", "similar-anchor-sbt")
    unrelated_anchor = await _create_entity(entity_repo, "movie", "Unrelated Anchor", "unrelated-anchor-sbt")
    tv_anchor = await _create_entity(entity_repo, "tv_series", "TV Anchor", "tv-anchor-sbt")
    await db_session.commit()

    await entity_repo.create_relationship(current_movie.id, similar_anchor.id, "similar_to", weight=0.6)
    await db_session.commit()

    for entity, score in ((current_movie, 7.5), (similar_anchor, 8.5), (unrelated_anchor, 8.0), (tv_anchor, 9.0)):
        await _set_score(db_session, entity.id, score)
    await db_session.commit()

    # unrelated_anchor ranks strongest (rank=1) but has no similar_to edge
    # to current_movie; similar_anchor is weaker (rank=2) but does. tv_anchor
    # is the wrong entity_type entirely and must never be picked.
    await taste_repo.bulk_upsert_anchors(
        test_user.id,
        [
            {"entity_id": unrelated_anchor.id, "anchor_strength": "primary", "match_score": 90.0, "rank": 1},
            {"entity_id": similar_anchor.id, "anchor_strength": "strong_signal", "match_score": 80.0, "rank": 2},
            {"entity_id": tv_anchor.id, "anchor_strength": "strong_signal", "match_score": 95.0, "rank": 3},
        ],
    )
    await db_session.commit()

    res = await client.get(f"/api/v1/movies/{current_movie.slug}/suggested-battle", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["category"] == "movie"
    slugs = {data["left"]["slug"], data["right"]["slug"]}
    assert slugs == {similar_anchor.slug, current_movie.slug}
    assert data["right"]["slug"] == current_movie.slug


async def test_suggested_battle_is_null_without_similar_to(
    client, db_session, test_user, auth_headers
):
    """
    Previously this fell back to the user's strongest same-type anchor
    whenever they shared even one genre -- in practice that produced
    nonsense pairings (e.g. a sitcom "vs." an unrelated epic fantasy series
    that both happen to be tagged "Drama" among several genres). The card
    should just not show up rather than suggest a battle between two
    titles with no real similar_to relationship.
    """
    entity_repo = EntityRepository(db_session)
    taste_repo = TasteRepository(db_session)

    current_movie = await _create_entity(entity_repo, "movie", "Current Movie 2", "current-movie-sbt-2")
    unrelated_anchor = await _create_entity(entity_repo, "movie", "Unrelated Anchor 2", "unrelated-anchor-sbt-2")
    await db_session.commit()

    for entity, score in ((current_movie, 7.0), (unrelated_anchor, 8.0)):
        await _set_score(db_session, entity.id, score)
    await db_session.commit()

    await taste_repo.bulk_upsert_anchors(
        test_user.id,
        [{"entity_id": unrelated_anchor.id, "anchor_strength": "primary", "match_score": 90.0, "rank": 1}],
    )
    await db_session.commit()

    res = await client.get(f"/api/v1/movies/{current_movie.slug}/suggested-battle", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["data"] is None


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
