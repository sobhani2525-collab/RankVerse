"""
Tests for user list creation and the like/follow social actions.
Run with: pytest tests/test_lists.py
"""


async def test_create_list_requires_auth(client):
    res = await client.post("/api/v1/lists", json={"title": "No Auth List"})
    assert res.status_code == 401


async def test_create_list(client, auth_headers):
    res = await client.post(
        "/api/v1/lists",
        headers=auth_headers,
        json={"title": "My Favorite Movies", "description": "a test list", "tags": ["fun"]},
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["slug"].startswith("my-favorite-movies")


async def test_create_list_generates_unique_slugs_on_title_collision(client, auth_headers):
    first = await client.post(
        "/api/v1/lists", headers=auth_headers, json={"title": "Same Title"}
    )
    second = await client.post(
        "/api/v1/lists", headers=auth_headers, json={"title": "Same Title"}
    )
    assert first.json()["data"]["slug"] != second.json()["data"]["slug"]


async def test_toggle_like_flips_state_and_persists(client, auth_headers):
    created = await client.post(
        "/api/v1/lists", headers=auth_headers, json={"title": "Likeable List"}
    )
    slug = created.json()["data"]["slug"]

    liked = await client.post(f"/api/v1/lists/{slug}/like", headers=auth_headers)
    assert liked.status_code == 200
    assert liked.json()["data"]["liked"] is True

    detail = await client.get(f"/api/v1/lists/{slug}", headers=auth_headers)
    assert detail.json()["data"]["is_liked"] is True
    assert detail.json()["data"]["like_count"] == 1

    unliked = await client.post(f"/api/v1/lists/{slug}/like", headers=auth_headers)
    assert unliked.json()["data"]["liked"] is False


async def test_toggle_follow_flips_state_and_persists(client, auth_headers):
    created = await client.post(
        "/api/v1/lists", headers=auth_headers, json={"title": "Followable List"}
    )
    slug = created.json()["data"]["slug"]

    followed = await client.post(f"/api/v1/lists/{slug}/follow", headers=auth_headers)
    assert followed.status_code == 200
    assert followed.json()["data"]["following"] is True

    detail = await client.get(f"/api/v1/lists/{slug}", headers=auth_headers)
    assert detail.json()["data"]["is_following"] is True

    unfollowed = await client.post(f"/api/v1/lists/{slug}/follow", headers=auth_headers)
    assert unfollowed.json()["data"]["following"] is False


async def test_only_owner_can_update_list(client, auth_headers, db_session):
    from app.core.security import create_access_token, hash_password
    from app.modules.users.repository import UserRepository

    created = await client.post(
        "/api/v1/lists", headers=auth_headers, json={"title": "Owner Only List"}
    )
    slug = created.json()["data"]["slug"]

    other_user = await UserRepository(db_session).create(
        email="other@example.com", username="otheruser", hashed_password=hash_password("Sup3rSecret!1")
    )
    await db_session.commit()
    other_headers = {"Authorization": f"Bearer {create_access_token(str(other_user.id))}"}

    res = await client.put(
        f"/api/v1/lists/{slug}", headers=other_headers, json={"title": "Hijacked"}
    )
    assert res.status_code == 401


async def _graph_fixture(db_session):
    """Inception -> Memento (shared director) -> Shutter Island (no link to
    Memento, but shares DiCaprio with Inception = a backlink)."""
    from app.modules.entities.models import EntityRanking
    from app.modules.entities.repository import EntityRepository

    repo = EntityRepository(db_session)

    async def make(entity_type, title, attributes=None):
        return await repo.create_entity(
            entity_type=entity_type, external_id=None, external_source=None,
            title=title, slug=title.lower().replace(" ", "-"), attributes=attributes or {},
        )

    nolan = await make("person", "Christopher Nolan")
    scorsese = await make("person", "Martin Scorsese")
    dicaprio = await make("person", "Leonardo DiCaprio")
    pearce = await make("person", "Guy Pearce")
    scifi = await make("genre", "Science Fiction")
    drama = await make("genre", "Drama")
    inception = await make(
        "movie", "Inception",
        {"year": 2010, "title_fa": "تلقین", "poster_path": "/i.jpg", "overview": "دزدی در رؤیا."},
    )
    memento = await make("movie", "Memento", {"year": 2000})
    shutter = await make("movie", "Shutter Island", {"year": 2010})
    await db_session.commit()

    for movie_, director, actor, genre in [
        (inception, nolan, dicaprio, scifi),
        (memento, nolan, pearce, drama),
        (shutter, scorsese, dicaprio, drama),
    ]:
        await repo.create_relationship(movie_.id, director.id, "directed_by")
        await repo.create_relationship(movie_.id, actor.id, "acted_in", edge_metadata={"order": 0})
        await repo.create_relationship(movie_.id, genre.id, "has_genre")
    db_session.add(EntityRanking(entity_id=inception.id, computed_score=8.8, total_votes=10))
    await db_session.commit()
    return inception, memento, shutter


async def test_list_detail_returns_constellation(client, auth_headers, db_session):
    inception, memento, shutter = await _graph_fixture(db_session)
    created = await client.post("/api/v1/lists", headers=auth_headers, json={"title": "Mind Benders"})
    slug = created.json()["data"]["slug"]
    for entity in (inception, memento, shutter):
        res = await client.post(
            f"/api/v1/lists/{slug}/items", headers=auth_headers, json={"entity_id": str(entity.id)}
        )
        assert res.status_code == 200

    data = (await client.get(f"/api/v1/lists/{slug}", headers=auth_headers)).json()["data"]

    first = data["items"][0]
    assert first["entity"]["title_fa"] == "تلقین"
    assert first["year"] == 2010
    assert first["director"]["title"] == "Christopher Nolan"
    assert first["lead_actor"]["title"] == "Leonardo DiCaprio"
    assert [g["title"] for g in first["genres"]] == ["Science Fiction"]
    assert first["composite_score"] == 8.8
    assert first["overview"] == "دزدی در رؤیا."
    assert data["items"][1]["overview"] is None
    # No ranking row -> no score, not a placeholder.
    assert data["items"][1]["composite_score"] is None

    assert [(e["kind"], e["value"]) for e in data["edges"]] == [
        ("people", "Christopher Nolan"),
        ("genre", "Drama"),
    ]
    assert data["backlinks"] == [
        {"rank": 3, "target_position": 1, "person_name": "Leonardo DiCaprio", "person_slug": "leonardo-dicaprio"}
    ]
    assert data["dna"]["type_counts"] == {"movie": 3}
    assert {h["entity"]["title"] for h in data["dna"]["hubs"]} == {"Christopher Nolan", "Leonardo DiCaprio"}
    assert data["battle_pair"]["left_rank"] == 1
    assert data["battle_pair"]["right_rank"] == 2
    assert data["battle_pair"]["kind"] == "director"
    assert data["updated_at"] is not None


async def test_empty_list_detail_has_no_constellation(client, auth_headers):
    created = await client.post("/api/v1/lists", headers=auth_headers, json={"title": "Empty Sky"})
    slug = created.json()["data"]["slug"]
    data = (await client.get(f"/api/v1/lists/{slug}")).json()["data"]
    assert data["edges"] == [] and data["backlinks"] == []
    assert data["dna"] is None and data["battle_pair"] is None


async def test_related_lists_carry_a_reason_and_skip_unrelated(client, auth_headers, db_session):
    inception, memento, _ = await _graph_fixture(db_session)

    async def make_list(title, tags, entities):
        res = await client.post("/api/v1/lists", headers=auth_headers, json={"title": title, "tags": tags})
        slug = res.json()["data"]["slug"]
        for entity in entities:
            await client.post(f"/api/v1/lists/{slug}/items", headers=auth_headers, json={"entity_id": str(entity.id)})
        return slug

    source = await make_list("Source", ["nolan"], [inception, memento])
    sharing_items = await make_list("Shares Items", [], [inception, memento])
    sharing_tag = await make_list("Shares Tag", ["nolan"], [])
    await make_list("Unrelated", ["other"], [])

    related = (await client.get(f"/api/v1/lists/{source}/related")).json()["data"]
    by_slug = {r["slug"]: r for r in related}
    assert set(by_slug) == {sharing_items, sharing_tag}
    assert by_slug[sharing_items]["shared_item_count"] == 2
    assert by_slug[sharing_tag]["shared_tag"] == "nolan"
    assert related[0]["slug"] == sharing_items


async def _list_with(client, auth_headers, title, entities):
    created = await client.post("/api/v1/lists", headers=auth_headers, json={"title": title})
    slug = created.json()["data"]["slug"]
    for entity in entities:
        res = await client.post(
            f"/api/v1/lists/{slug}/items", headers=auth_headers, json={"entity_id": str(entity.id)}
        )
        assert res.status_code == 200
    return slug


async def test_candidates_search_skips_items_already_in_the_list(client, auth_headers, db_session):
    inception, memento, shutter = await _graph_fixture(db_session)
    slug = await _list_with(client, auth_headers, "Candidates Search", [inception])

    res = await client.get(f"/api/v1/lists/{slug}/candidates?q=i", headers=auth_headers)
    assert res.status_code == 200
    titles = [c["entity"]["title"] for c in res.json()["data"]]
    assert "Inception" not in titles
    assert "Shutter Island" in titles
    shutter_row = next(c for c in res.json()["data"] if c["entity"]["title"] == "Shutter Island")
    # Same graph fields as a list item, so the client can explain the link.
    assert shutter_row["director"]["title"] == "Martin Scorsese"
    assert shutter_row["lead_actor"]["title"] == "Leonardo DiCaprio"
    assert [g["title"] for g in shutter_row["genres"]] == ["Drama"]


async def test_candidates_without_query_suggest_shared_director_or_lead(client, auth_headers, db_session):
    from app.modules.entities.repository import EntityRepository

    inception, memento, shutter = await _graph_fixture(db_session)
    repo = EntityRepository(db_session)
    stranger = await repo.create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Unrelated Film", slug="unrelated-film", attributes={},
    )
    await db_session.commit()

    slug = await _list_with(client, auth_headers, "Candidates Graph", [inception])
    res = await client.get(f"/api/v1/lists/{slug}/candidates", headers=auth_headers)
    assert res.status_code == 200
    titles = [c["entity"]["title"] for c in res.json()["data"]]
    # Memento shares Nolan, Shutter Island shares DiCaprio; the unrelated
    # film and Inception itself (already listed) are never suggested.
    assert set(titles) == {"Memento", "Shutter Island"}
    assert stranger.title not in titles


async def test_candidates_respect_add_permission(client, auth_headers, db_session):
    from app.core.security import create_access_token, hash_password
    from app.modules.users.repository import UserRepository

    created = await client.post(
        "/api/v1/lists", headers=auth_headers,
        json={"title": "Private Picks", "visibility": "private"},
    )
    slug = created.json()["data"]["slug"]
    other_user = await UserRepository(db_session).create(
        email="cand@example.com", username="canduser", hashed_password=hash_password("Sup3rSecret!1")
    )
    await db_session.commit()
    other_headers = {"Authorization": f"Bearer {create_access_token(str(other_user.id))}"}

    assert (await client.get(f"/api/v1/lists/{slug}/candidates")).status_code == 401
    res = await client.get(f"/api/v1/lists/{slug}/candidates?q=a", headers=other_headers)
    assert res.status_code == 401
