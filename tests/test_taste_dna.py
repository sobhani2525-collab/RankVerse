"""
Tests for GET /users/me/taste-dna. Focused on the read-side contract the
frontend depends on: insight is a single nullable object (not a list --
user_taste_insights is single-row-per-user, same as snapshot), and an
empty/not-yet-computed profile returns null/[] fields with a 200, never
an error.

Run with: TEST_DATABASE_URL=... pytest tests/test_taste_dna.py
"""
from app.modules.entities.repository import EntityRepository
from app.modules.taste.repository import TasteRepository


async def test_taste_dna_empty_state_for_new_user(client, db_session, auth_headers):
    res = await client.get("/api/v1/users/me/taste-dna", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["snapshot"] is None
    assert data["dimensions"] == []
    assert data["anchors"] == []
    assert data["insight"] is None
    assert data["contribution_stats"] is None


async def test_taste_dna_insight_is_a_single_object_not_a_list(client, db_session, test_user, auth_headers):
    """
    Reproduces the exact schema bug reported: user_taste_insights is
    single-row-per-user (TasteRepository.replace_insight docstring), so
    the API's `insight` field must be a nullable object, not an array --
    even with a real row present.
    """
    taste_repo = TasteRepository(db_session)
    await taste_repo.replace_insight(
        test_user.id, {"insight_text": "شما عاشق درام‌های پیچیده‌اید.", "insight_tags": ["drama", "complex"]}
    )
    await db_session.commit()

    res = await client.get("/api/v1/users/me/taste-dna", headers=auth_headers)
    assert res.status_code == 200
    insight = res.json()["data"]["insight"]
    assert isinstance(insight, dict)  # not a list
    assert insight["insight_text"] == "شما عاشق درام‌های پیچیده‌اید."
    assert insight["insight_tags"] == ["drama", "complex"]


async def test_taste_dna_full_profile_shape(client, db_session, test_user, auth_headers):
    entity_repo = EntityRepository(db_session)
    taste_repo = TasteRepository(db_session)

    movie = await entity_repo.create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Anchor Movie", slug="anchor-movie-taste-test", attributes={"poster_path": "/x.jpg"},
    )
    await db_session.commit()

    await taste_repo.bulk_upsert_dimensions(
        test_user.id, "genre",
        [{"dimension_key": "drama", "score": 0.82, "confidence": 0.6, "sample_size": 12}],
    )
    await taste_repo.replace_snapshot(
        test_user.id, "movie",
        {"label": "Story Seeker", "model_confidence": 0.71, "model_version": "v1"},
    )
    await taste_repo.replace_insight(
        test_user.id, {"insight_text": "شما عاشق درام‌های پیچیده‌اید.", "insight_tags": ["drama"]}
    )
    await taste_repo.bulk_upsert_anchors(
        test_user.id,
        [{"entity_id": movie.id, "anchor_strength": "primary", "match_score": 0.9, "rank": 1}],
    )
    await db_session.commit()

    res = await client.get("/api/v1/users/me/taste-dna", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()["data"]

    assert data["snapshot"]["label"] == "Story Seeker"
    assert data["dimensions"][0]["dimension_key"] == "drama"
    assert data["insight"]["insight_text"] == "شما عاشق درام‌های پیچیده‌اید."
    assert data["anchors"][0]["entity"]["slug"] == "anchor-movie-taste-test"
    assert data["anchors"][0]["entity"]["entity_type"] == "movie"
