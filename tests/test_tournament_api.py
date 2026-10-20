"""
Tournament battle HTTP API: create/edit/publish, visibility rules, hidden vote
counts, ownership, soft delete, follows and the internal advance endpoint.

Needs Postgres: TEST_DATABASE_URL=... pytest tests/test_tournament_api.py
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.config import settings
from app.core.security import create_access_token, hash_password
from app.modules.battles.tournament_models import Battle, BattleMatch
from app.modules.entities.repository import EntityRepository
from app.modules.users.repository import UserRepository

URL = "/api/v1/battles"


async def _entities(db, n, entity_type="movie"):
    repo = EntityRepository(db)
    out = [
        await repo.create_entity(
            entity_type=entity_type, external_id=None, external_source=None,
            title=f"t{i}", slug=f"t{i}-{uuid.uuid4().hex[:6]}", attributes={"title_fa": f"ف{i}"},
        )
        for i in range(n)
    ]
    await db.commit()
    return out


async def _other_user(db):
    user = await UserRepository(db).create(
        email="other@example.com", username="other", hashed_password=hash_password("Sup3rSecret!1")
    )
    await db.commit()
    return {"Authorization": f"Bearer {create_access_token(str(user.id))}"}


async def _make(client, headers, entities, **publish):
    r = await client.post(URL, json={"title": "بهترین فیلم", "entity_type": "movie", "bracket_size": 4}, headers=headers)
    assert r.status_code == 201, r.text
    slug = r.json()["data"]["slug"]
    r = await client.put(f"{URL}/{slug}/entries", json={"entity_ids": [str(e.id) for e in entities]}, headers=headers)
    assert r.status_code == 200, r.text
    if publish is not None:
        body = {"visibility": "public", "round_duration_seconds": 3600, **publish}
        r = await client.post(f"{URL}/{slug}/publish", json=body, headers=headers)
        assert r.status_code == 200, r.text
    return slug, r.json()["data"]


async def test_slug_is_8_char_base62_and_draft_is_private(client, db_session, auth_headers):
    r = await client.post(URL, json={"title": "نبرد من", "entity_type": "movie", "bracket_size": 8}, headers=auth_headers)
    slug = r.json()["data"]["slug"]
    assert len(slug) == 8 and slug.isalnum()
    assert (await client.get(f"{URL}/{slug}", headers=auth_headers)).json()["data"]["is_owner"] is True
    assert (await client.get(f"{URL}/{slug}")).status_code == 404  # guests can't see drafts
    assert (await client.get(f"{URL}/{slug}", headers=await _other_user(db_session))).status_code == 404


async def test_title_length_and_daily_limit(client, auth_headers, monkeypatch):
    bad = await client.post(URL, json={"title": "x", "entity_type": "movie", "bracket_size": 4}, headers=auth_headers)
    assert bad.status_code == 400
    monkeypatch.setattr(settings, "battle_max_new_per_day", 1)
    ok = await client.post(URL, json={"title": "سه حرف", "entity_type": "movie", "bracket_size": 4}, headers=auth_headers)
    assert ok.status_code == 201
    again = await client.post(URL, json={"title": "سه حرف", "entity_type": "movie", "bracket_size": 4}, headers=auth_headers)
    assert again.status_code == 429


async def test_entries_must_match_type_and_size(client, db_session, auth_headers):
    movies = await _entities(db_session, 4)
    series = await _entities(db_session, 1, "tv_series")
    slug = (await client.post(URL, json={"title": "نبرد من", "entity_type": "movie", "bracket_size": 4}, headers=auth_headers)).json()["data"]["slug"]
    mixed = await client.put(f"{URL}/{slug}/entries", json={"entity_ids": [str(series[0].id)]}, headers=auth_headers)
    assert mixed.status_code == 400
    early = await client.post(f"{URL}/{slug}/publish", json={"visibility": "public"}, headers=auth_headers)
    assert early.status_code == 400  # no entries yet
    ok = await client.put(f"{URL}/{slug}/entries", json={"entity_ids": [str(e.id) for e in movies]}, headers=auth_headers)
    assert ok.status_code == 200


async def test_only_owner_can_manage(client, db_session, auth_headers):
    slug, _ = await _make(client, auth_headers, await _entities(db_session, 4))
    other = await _other_user(db_session)
    for method, path, body in [
        ("patch", "", {"title": "عنوان تازه"}), ("post", "/close-round", None),
        ("post", "/finish", None), ("delete", "", None),
    ]:
        r = await getattr(client, method)(f"{URL}/{slug}{path}", headers=other, **({"json": body} if body else {}))
        assert r.status_code == 404, (method, path)


async def test_vote_counts_hidden_until_voted_then_revealed(client, db_session, auth_headers):
    slug, detail = await _make(client, auth_headers, await _entities(db_session, 4))
    match = detail["rounds"][0]["matches"][0]
    assert match["votes_a"] is None and match["votes_b"] is None
    other = await _other_user(db_session)
    r = await client.post(f"{URL}/{slug}/matches/{match['id']}/vote", json={"entity_id": match["entity_a"]["id"]}, headers=other)
    shown = r.json()["data"]["rounds"][0]["matches"][0]
    assert (shown["votes_a"], shown["votes_b"], shown["my_vote"]) == (1, 0, match["entity_a"]["id"])
    # the owner who has not voted, and guests, still see nothing
    guest = (await client.get(f"{URL}/{slug}")).json()["data"]["rounds"][0]["matches"][0]
    assert guest["votes_a"] is None and (await client.get(f"{URL}/{slug}")).json()["data"]["total_votes"] == 1
    # guests cannot vote
    assert (await client.post(f"{URL}/{slug}/matches/{match['id']}/vote", json={"entity_id": match["entity_a"]["id"]})).status_code == 401


async def test_publish_locks_structure_and_delete_archives(client, db_session, auth_headers):
    slug, _ = await _make(client, auth_headers, await _entities(db_session, 4))
    assert (await client.patch(f"{URL}/{slug}", json={"bracket_size": 8}, headers=auth_headers)).status_code == 400
    assert (await client.patch(f"{URL}/{slug}", json={"title": "عنوان تازه"}, headers=auth_headers)).status_code == 200
    assert (await client.delete(f"{URL}/{slug}", headers=auth_headers)).json()["data"]["result"] == "archived"
    assert (await client.get(f"{URL}/{slug}")).status_code == 200  # link still works
    listing = (await client.get(URL)).json()["data"]
    assert slug not in [b["slug"] for b in listing]


async def test_draft_delete_is_real(client, auth_headers, db_session):
    slug = (await client.post(URL, json={"title": "پیش نویس", "entity_type": "movie", "bracket_size": 4}, headers=auth_headers)).json()["data"]["slug"]
    assert (await client.delete(f"{URL}/{slug}", headers=auth_headers)).json()["data"]["result"] == "deleted"
    assert (await db_session.execute(select(Battle).where(Battle.slug == slug))).first() is None


async def test_public_list_mine_tabs_and_follow(client, db_session, auth_headers):
    slug, _ = await _make(client, auth_headers, await _entities(db_session, 4))
    listing = (await client.get(URL)).json()
    assert [b["slug"] for b in listing["data"]] == [slug] and listing["meta"]["total"] == 1
    mine = lambda tab, h=auth_headers: client.get(f"{URL}/mine", params={"tab": tab}, headers=h)
    assert [b["slug"] for b in (await mine("active")).json()["data"]] == [slug]
    assert (await mine("draft")).json()["data"] == []
    other = await _other_user(db_session)
    assert (await mine("following", other)).json()["data"] == []
    await client.put(f"{URL}/{slug}/follow", headers=other)
    assert [b["slug"] for b in (await mine("following", other)).json()["data"]] == [slug]
    assert (await client.get(f"{URL}/{slug}", headers=other)).json()["data"]["is_following"] is True
    await client.delete(f"{URL}/{slug}/follow", headers=other)
    assert (await mine("following", other)).json()["data"] == []


async def test_creator_controls_and_lazy_advance_on_read(client, db_session, auth_headers):
    slug, _ = await _make(client, auth_headers, await _entities(db_session, 4))
    data = (await client.post(f"{URL}/{slug}/extend", json={"seconds": 3600}, headers=auth_headers)).json()["data"]
    assert data["current_round"] == 1
    data = (await client.post(f"{URL}/{slug}/close-round", headers=auth_headers)).json()["data"]
    assert data["current_round"] == 2
    # make the final overdue, then a plain read advances and crowns the winner
    battle = (await db_session.execute(select(Battle).where(Battle.slug == slug))).scalar_one()
    for m in (await db_session.execute(select(BattleMatch).where(BattleMatch.battle_id == battle.id, BattleMatch.round == 2))).scalars():
        m.closes_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db_session.commit()
    done = (await client.get(f"{URL}/{slug}")).json()["data"]
    assert done["status"] == "completed" and done["winner"] is not None


async def test_internal_advance_due_requires_key(client, db_session, auth_headers, monkeypatch):
    monkeypatch.setattr(settings, "internal_api_key", "k")
    assert (await client.post(f"{URL}/internal/advance-due")).status_code == 401
    r = await client.post(f"{URL}/internal/advance-due", headers={"X-Internal-Api-Key": "k"})
    assert r.status_code == 200 and r.json()["data"]["advanced"] == 0


async def test_candidates_combine_person_genre_and_decade(client, db_session, auth_headers):
    from app.modules.entities.models import RelationshipEdge

    repo = EntityRepository(db_session)

    async def make(kind, title, **attrs):
        return await repo.create_entity(
            entity_type=kind, external_id=None, external_source=None,
            title=title, slug=f"{title}-{uuid.uuid4().hex[:6]}", attributes=attrs,
        )

    director = await make("person", "dir")
    comedy, drama = await make("genre", "comedy"), await make("genre", "drama")
    a = await make("movie", "a90s-comedy", year=1994)
    b = await make("movie", "b90s-drama", year=1995)
    c = await make("movie", "c80s-comedy", year=1988)
    d = await make("tv_series", "d90s-comedy", year=1996)
    for work, genre in ((a, comedy), (b, drama), (c, comedy), (d, comedy)):
        db_session.add(RelationshipEdge(from_entity_id=work.id, to_entity_id=genre.id, relation_type="has_genre"))
    for work in (a, b):
        db_session.add(RelationshipEdge(from_entity_id=work.id, to_entity_id=director.id, relation_type="directed_by"))
    await db_session.commit()

    async def titles(**params):
        r = await client.get(f"{URL}/candidates", params=params, headers=auth_headers)
        assert r.status_code == 200, r.text
        return sorted(i["title"] for i in r.json()["data"]), r.json()["meta"]["total"]

    assert (await titles(entity_type="movie", genre=comedy.slug, decade=1990))[0] == ["a90s-comedy"]
    assert (await titles(entity_type="tv_series", genre=comedy.slug, decade=1990))[0] == ["d90s-comedy"]
    assert (await titles(entity_type="movie", person=director.slug, role="director"))[0] == ["a90s-comedy", "b90s-drama"]
    assert (await titles(entity_type="movie", person=director.slug, genre=drama.slug, decade=1990))[0] == ["b90s-drama"]
    assert (await titles(entity_type="movie", person=director.slug, role="actor"))[0] == []
    assert (await titles(entity_type="movie", q="comedy"))[1] == 2
    assert (await client.get(f"{URL}/candidates", params={"entity_type": "movie", "decade": 1995}, headers=auth_headers)).status_code == 400
    assert (await client.get(f"{URL}/candidates", params={"entity_type": "movie"})).status_code == 401
    genres = (await client.get(f"{URL}/filter-genres", headers=auth_headers)).json()["data"]
    assert {g["slug"] for g in genres} >= {comedy.slug, drama.slug}


async def test_related_battles_and_lists_for_the_winner(client, db_session, auth_headers):
    from app.modules.lists.models import UserList, UserListItem
    from app.modules.users.repository import UserRepository

    entities = await _entities(db_session, 8)
    slug, _ = await _make(client, auth_headers, entities[:4])
    other_slug, _ = await _make(client, auth_headers, [entities[0], entities[4], entities[5], entities[6]])
    await client.post(f"{URL}/{slug}/finish", headers=auth_headers)
    winner = (await client.get(f"{URL}/{slug}")).json()["data"]["winner"]

    # winner is seed 1 (entities[0]); another battle and a public list include it
    owner = await UserRepository(db_session).get_by_email("tester@example.com")
    lst = UserList(user_id=owner.id, title="لیست من", slug=f"l-{uuid.uuid4().hex[:6]}", visibility="public")
    db_session.add(lst)
    await db_session.flush()
    db_session.add(UserListItem(list_id=lst.id, entity_id=entities[0].id, entity_type="movie", added_by_user_id=owner.id))
    await db_session.commit()

    r = (await client.get(f"{URL}/{slug}/related")).json()["data"]
    assert r["winner"]["id"] == winner["id"] == str(entities[0].id)
    assert [b["slug"] for b in r["battles"]] == [other_slug]
    assert [l["slug"] for l in r["lists"]] == [lst.slug]
    # not finished -> nothing yet
    assert (await client.get(f"{URL}/{other_slug}/related")).json()["data"]["battles"] == []
