"""The list page's latency is almost entirely sequential DB round trips
(backend and DB are ~130ms apart), so the number of statements it issues and
the overlap of the independent ones are worth pinning down."""
import uuid
from contextlib import asynccontextmanager

from sqlalchemy import delete, event, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.entities.models import Entity, RelationshipEdge
from app.modules.lists.models import ListItemLike, UserList, UserListItem
from app.modules.lists.service import ListService
from app.modules.users.models import User


async def _make_public_list(client, auth_headers, db_session, n_items=6):
    from app.modules.entities.repository import EntityRepository

    res = await client.post("/api/v1/lists", headers=auth_headers, json={"title": "Probe", "visibility": "private"})
    slug = res.json()["data"]["slug"]
    repo = EntityRepository(db_session)
    genre = await repo.create_entity(
        entity_type="genre", external_id=None, external_source=None, title="G", slug="g", attributes={}
    )
    for i in range(n_items):
        movie = await repo.create_entity(
            entity_type="movie", external_id=None, external_source=None, title=f"M{i}", slug=f"m{i}", attributes={}
        )
        await db_session.commit()
        await repo.create_relationship(movie.id, genre.id, "has_genre")
        await db_session.commit()
        await client.post(f"/api/v1/lists/{slug}/items", headers=auth_headers, json={"entity_id": str(movie.id)})
    await client.put(f"/api/v1/lists/{slug}", headers=auth_headers, json={"visibility": "public"})
    return slug


async def test_list_detail_statement_count_is_small(client, auth_headers, db_session):
    slug = await _make_public_list(client, auth_headers, db_session)

    statements: list[str] = []
    sync_engine = db_session.get_bind()

    @event.listens_for(sync_engine, "before_cursor_execute")
    def _count(conn, cursor, statement, *a):
        if "SAVEPOINT" not in statement:
            statements.append(statement)

    try:
        for headers in (None, auth_headers):
            statements.clear()
            res = await client.get(f"/api/v1/lists/{slug}", headers=headers or {})
            assert res.status_code == 200
            # list+items+entities+rankings+owner in ONE query, graph edges,
            # contributors/like/follow in one, votes in one (+ the bump, which
            # runs inline in tests). Was 10-13 before.
            limit = 6 if headers is None else 7  # + the auth user lookup
            assert len(statements) <= limit, statements
    finally:
        event.remove(sync_engine, "before_cursor_execute", _count)


async def test_list_detail_counts_the_view_after_responding(client, auth_headers, db_session):
    slug = await _make_public_list(client, auth_headers, db_session)
    first = (await client.get(f"/api/v1/lists/{slug}")).json()["data"]["view_count"]
    second = (await client.get(f"/api/v1/lists/{slug}")).json()["data"]["view_count"]
    assert second == first + 1


async def test_overlapped_queries_match_sequential_result(test_engine, monkeypatch):
    """Runs the real asyncio.gather path on separate connections (committed
    data, cleaned up afterwards) and checks it equals the in-order result."""
    from app.modules.lists import service as lists_service

    ids = {k: uuid.uuid4() for k in ("user", "other", "list", "m1", "m2", "person", "genre", "i1", "i2")}
    async with AsyncSession(test_engine, expire_on_commit=False) as s:
        s.add_all([
            User(id=ids["user"], email="a@x.io", username="viewer", hashed_password="x"),
            User(id=ids["other"], email="b@x.io", username="other", hashed_password="x"),
        ])
        for key, etype in (("m1", "movie"), ("m2", "movie"), ("person", "person"), ("genre", "genre")):
            s.add(Entity(id=ids[key], entity_type=etype, title=key, slug=f"overlap-{key}", attributes={}))
        await s.flush()
        s.add_all([
            RelationshipEdge(from_entity_id=ids["m1"], to_entity_id=ids["genre"], relation_type="has_genre"),
            RelationshipEdge(from_entity_id=ids["m1"], to_entity_id=ids["person"], relation_type="directed_by"),
            UserList(id=ids["list"], user_id=ids["other"], title="Overlap", slug="overlap-list", visibility="public"),
        ])
        await s.flush()
        s.add_all([
            UserListItem(id=ids["i1"], list_id=ids["list"], entity_id=ids["m1"], entity_type="movie",
                         added_by_user_id=ids["other"], position=0),
            UserListItem(id=ids["i2"], list_id=ids["list"], entity_id=ids["person"], entity_type="person",
                         added_by_user_id=ids["other"], position=1),
        ])
        await s.flush()
        s.add_all([
            ListItemLike(list_item_id=ids["i1"], user_id=ids["user"], is_like=True),
            ListItemLike(list_item_id=ids["i1"], user_id=ids["other"], is_like=False),
        ])
        await s.commit()

    @asynccontextmanager
    async def side():
        async with AsyncSession(test_engine, expire_on_commit=False) as session:
            yield session

    monkeypatch.setattr(lists_service, "_side_session", side)

    async def detail(viewer):
        async with AsyncSession(test_engine, expire_on_commit=False) as session:
            return (await ListService(session).get_list_detail("overlap-list", viewer)).model_dump()

    async def sequential(*aws):
        return [await a for a in aws]

    try:
        for viewer in (None, ids["user"]):
            overlapped = await detail(viewer)
            monkeypatch.setattr(lists_service, "_gather", sequential)
            in_order = await detail(viewer)
            monkeypatch.undo()
            monkeypatch.setattr(lists_service, "_side_session", side)
            assert overlapped == in_order
        mine = await detail(ids["user"])
        item = next(i for i in mine["items"] if i["id"] == ids["i1"])
        assert (item["like_count"], item["dislike_count"], item["my_vote"]) == (1, 1, True)
        assert mine["contributor_count"] == 2
    finally:
        async with AsyncSession(test_engine) as s:
            await s.execute(delete(User).where(User.id.in_([ids["user"], ids["other"]])))
            await s.execute(delete(Entity).where(Entity.id.in_([ids[k] for k in ("m1", "m2", "person", "genre")])))
            await s.commit()
            leftovers = (await s.execute(select(UserList).where(UserList.id == ids["list"]))).first()
            assert leftovers is None
