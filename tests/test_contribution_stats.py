"""
Tests for ContributionStatsComputer, the writer user_contribution_stats
never had before (see compute.py's ContributionStatsComputer docstring):
verifies each of the three real actions (rating, a decisive battle vote,
a list comment) actually produces/updates a row through the real
endpoints, that a skip vote does not count as a battle contribution, and
that GET /users/me/taste-dna surfaces the result without the dropped
relationships_discovered field.

Run with: TEST_DATABASE_URL=... pytest tests/test_contribution_stats.py
"""
import uuid

from app.modules.entities.repository import EntityRepository


async def _create_movie(db_session, title: str):
    repo = EntityRepository(db_session)
    entity = await repo.create_entity(
        entity_type="movie",
        external_id=None,
        external_source=None,
        title=title,
        slug=f"{title.lower().replace(' ', '-')}-{uuid.uuid4().hex[:8]}",
        attributes={},
    )
    await db_session.commit()
    return entity


async def test_rating_populates_contribution_stats(client, db_session, auth_headers):
    movie = await _create_movie(db_session, "Contribution Rating Movie")

    res = await client.post(
        f"/api/v1/movies/{movie.slug}/rate", headers=auth_headers, json={"score": 8}
    )
    assert res.status_code == 200

    profile = await client.get("/api/v1/users/me/taste-dna", headers=auth_headers)
    stats = profile.json()["data"]["contribution_stats"]
    assert stats is not None
    assert stats["votes_count"] == 1
    assert stats["battles_count"] == 0
    assert stats["comments_count"] == 0
    assert stats["contribution_score"] == 1.0
    assert "relationships_discovered" not in stats


async def test_decisive_battle_vote_increments_battles_count(client, db_session, auth_headers):
    left = await _create_movie(db_session, "Battle Left Movie")
    right = await _create_movie(db_session, "Battle Right Movie")

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

    profile = await client.get("/api/v1/users/me/taste-dna", headers=auth_headers)
    stats = profile.json()["data"]["contribution_stats"]
    assert stats["battles_count"] == 1
    assert stats["votes_count"] == 0


async def test_skip_vote_does_not_count_as_a_contribution(client, db_session, auth_headers):
    left = await _create_movie(db_session, "Skip Left Movie")
    right = await _create_movie(db_session, "Skip Right Movie")

    res = await client.post(
        "/api/v1/battles/vote",
        headers=auth_headers,
        json={
            "category": "movie",
            "left_item": str(left.id),
            "right_item": str(right.id),
            "winner": "skip",
        },
    )
    assert res.status_code == 201

    profile = await client.get("/api/v1/users/me/taste-dna", headers=auth_headers)
    stats = profile.json()["data"]["contribution_stats"]
    assert stats is not None
    assert stats["battles_count"] == 0


async def test_list_comment_increments_comments_count(client, db_session, auth_headers):
    create_res = await client.post(
        "/api/v1/lists", headers=auth_headers, json={"title": "A Test List"}
    )
    assert create_res.status_code == 200
    slug = create_res.json()["data"]["slug"]

    comment_res = await client.post(
        f"/api/v1/lists/{slug}/comments", headers=auth_headers, json={"body": "Great list!"}
    )
    assert comment_res.status_code == 200

    profile = await client.get("/api/v1/users/me/taste-dna", headers=auth_headers)
    stats = profile.json()["data"]["contribution_stats"]
    assert stats["comments_count"] == 1


async def test_contribution_score_weights_actions_differently(client, db_session, auth_headers):
    movie = await _create_movie(db_session, "Weighted Score Movie")
    left = await _create_movie(db_session, "Weighted Left Movie")
    right = await _create_movie(db_session, "Weighted Right Movie")

    await client.post(f"/api/v1/movies/{movie.slug}/rate", headers=auth_headers, json={"score": 7})
    await client.post(
        "/api/v1/battles/vote",
        headers=auth_headers,
        json={
            "category": "movie",
            "left_item": str(left.id),
            "right_item": str(right.id),
            "winner": "right",
        },
    )

    profile = await client.get("/api/v1/users/me/taste-dna", headers=auth_headers)
    stats = profile.json()["data"]["contribution_stats"]
    # 1 vote (weight 1.0) + 1 battle (weight 2.0), per taste_contribution_*_weight settings.
    assert stats["contribution_score"] == 3.0
