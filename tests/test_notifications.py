"""
In-app notifications: aggregation, self-action skip, idempotency/cooldown,
cursor paging, preferences, ownership, hooks in the list actions.
Run with: TEST_DATABASE_URL=... pytest tests/test_notifications.py
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import func, select, update

from app.core.security import create_access_token, create_admin_access_token, hash_password
from app.modules.admin.models import AdminAccount
from app.modules.lists.models import UserList
from app.modules.notifications import service as notifications_service
from app.modules.notifications.models import Notification
from app.modules.notifications.service import NotificationService
from app.modules.users.repository import UserRepository


@pytest.fixture(autouse=True)
def _inline_notifications(monkeypatch, db_session):
    """Deliver notifications inline on the test transaction instead of a background task."""

    async def _inline(**kwargs):
        await NotificationService(db_session).notify(**kwargs)
        await db_session.commit()

    monkeypatch.setattr(notifications_service, "notify_later", _inline)


async def _user(db, name):
    user = await UserRepository(db).create(
        email=f"{name}@example.com", username=name, hashed_password=hash_password("Sup3rSecret!1")
    )
    await db.commit()
    return user, {"Authorization": f"Bearer {create_access_token(str(user.id))}"}


@pytest_asyncio.fixture
async def owner_list(db_session, test_user):
    lst = UserList(user_id=test_user.id, title="بهترین‌ها", slug="best-films", visibility="public")
    db_session.add(lst)
    await db_session.commit()
    return lst


async def _count(db, **where):
    stmt = select(func.count()).select_from(Notification)
    for k, v in where.items():
        stmt = stmt.where(getattr(Notification, k) == v)
    return (await db.execute(stmt)).scalar_one()


async def test_likes_aggregate_into_one_row_with_persian_message(client, db_session, test_user, auth_headers, owner_list):
    for i in range(3):
        _, headers = await _user(db_session, f"liker{i}")
        assert (await client.post("/api/v1/lists/best-films/like", headers=headers)).status_code == 200

    assert await _count(db_session, recipient_id=test_user.id) == 1
    res = await client.get("/api/v1/notifications", headers=auth_headers)
    assert res.headers["cache-control"] == "private, no-store"
    item = res.json()["data"]["items"][0]
    assert item["actor_count"] == 3
    assert "۲ نفر دیگر" in item["message"] and "liker2" in item["message"]
    assert item["link"] == "/lists/best-films"


async def test_own_action_creates_no_notification(client, db_session, test_user, auth_headers, owner_list):
    await client.post("/api/v1/lists/best-films/like", headers=auth_headers)
    await client.post("/api/v1/lists/best-films/follow", headers=auth_headers)
    await client.post("/api/v1/lists/best-films/comments", headers=auth_headers, json={"body": "mine"})
    assert await _count(db_session) == 0


async def test_like_unlike_like_is_idempotent(client, db_session, test_user, owner_list):
    _, headers = await _user(db_session, "flipper")
    for _ in range(3):  # like, unlike, like
        await client.post("/api/v1/lists/best-films/like", headers=headers)
    assert await _count(db_session, recipient_id=test_user.id) == 1
    row = (await db_session.execute(select(Notification))).scalar_one()
    assert row.actor_count == 1


async def test_same_actor_after_cooldown_does_not_double_count(client, db_session, test_user, owner_list):
    actor, headers = await _user(db_session, "returner")
    await client.post("/api/v1/lists/best-films/like", headers=headers)
    await client.post("/api/v1/lists/best-films/like", headers=headers)  # unlike
    await db_session.execute(update(Notification).values(updated_at=datetime.now(timezone.utc) - timedelta(hours=1)))
    await client.post("/api/v1/lists/best-films/like", headers=headers)
    row = (await db_session.execute(select(Notification))).scalar_one()
    assert row.actor_count == 1


async def test_after_reading_a_new_like_starts_a_new_row(client, db_session, test_user, auth_headers, owner_list):
    _, first = await _user(db_session, "first")
    _, second = await _user(db_session, "second")
    await client.post("/api/v1/lists/best-films/like", headers=first)
    await client.post("/api/v1/notifications/read-all", headers=auth_headers)
    await client.post("/api/v1/lists/best-films/like", headers=second)
    assert await _count(db_session, recipient_id=test_user.id) == 2
    assert (await client.get("/api/v1/notifications/unread-count", headers=auth_headers)).json()["data"]["count"] == 1


async def test_comment_and_reply_notifications(client, db_session, test_user, auth_headers, owner_list):
    _, commenter = await _user(db_session, "commenter")
    _, replier = await _user(db_session, "replier")
    posted = await client.post("/api/v1/lists/best-films/comments", headers=commenter, json={"body": "عالی بود"})
    cid = posted.json()["data"]["id"]
    await client.post(
        "/api/v1/lists/best-films/comments", headers=replier, json={"body": "موافقم", "parent_comment_id": cid}
    )
    owner_types = {n.type for n in (await db_session.execute(
        select(Notification).where(Notification.recipient_id == test_user.id))).scalars()}
    assert owner_types == {"list_commented"}
    commenter_rows = (await db_session.execute(
        select(Notification).where(Notification.type == "comment_replied"))).scalars().all()
    assert len(commenter_rows) == 1 and commenter_rows[0].payload["snippet"] == "موافقم"


async def test_follow_notifies_and_featured_notifies_owner(client, db_session, test_user, auth_headers, owner_list):
    _, follower = await _user(db_session, "follower")
    await client.post("/api/v1/lists/best-films/follow", headers=follower)
    admin = AdminAccount(email="admin@example.com", password_hash=hash_password("Sup3rSecret!1234"))
    db_session.add(admin)
    await db_session.commit()
    admin_headers = {"Authorization": f"Bearer {create_admin_access_token(str(admin.id))}"}
    res = await client.patch(f"/api/v1/admin/lists/{owner_list.id}", headers=admin_headers, json={"is_featured": True})
    assert res.status_code == 200
    types = {i["type"] for i in (await client.get("/api/v1/notifications", headers=auth_headers)).json()["data"]["items"]}
    assert types == {"list_followed", "list_featured"}


async def test_preferences_switch_off_a_type(client, db_session, test_user, auth_headers, owner_list):
    res = await client.put("/api/v1/notifications/preferences", headers=auth_headers,
                           json={"preferences": {"list_liked": False}})
    assert res.json()["data"]["list_liked"] is False and res.json()["data"]["list_followed"] is True
    _, liker = await _user(db_session, "muted")
    await client.post("/api/v1/lists/best-films/like", headers=liker)
    assert await _count(db_session) == 0
    bad = await client.put("/api/v1/notifications/preferences", headers=auth_headers,
                           json={"preferences": {"nonsense": True}})
    assert bad.status_code == 400


async def test_cursor_pagination_has_no_overlap(client, db_session, test_user, auth_headers):
    base = datetime.now(timezone.utc)
    for i in range(7):
        db_session.add(Notification(
            recipient_id=test_user.id, type="list_featured", target_type="list", target_id=uuid.uuid4(),
            payload={"list_title": f"L{i}", "list_slug": f"l{i}"}, created_at=base - timedelta(minutes=i),
        ))
    await db_session.commit()
    seen, cursor = [], None
    while True:
        url = "/api/v1/notifications?limit=3" + (f"&cursor={cursor}" if cursor else "")
        data = (await client.get(url, headers=auth_headers)).json()["data"]
        seen += [i["id"] for i in data["items"]]
        cursor = data["next_cursor"]
        if not cursor:
            break
    assert len(seen) == 7 and len(set(seen)) == 7


async def test_users_cannot_touch_each_others_notifications(client, db_session, test_user, auth_headers):
    row = Notification(recipient_id=test_user.id, type="list_featured", target_type="list",
                       target_id=uuid.uuid4(), payload={})
    db_session.add(row)
    await db_session.commit()
    _, other = await _user(db_session, "intruder")
    assert (await client.post(f"/api/v1/notifications/{row.id}/read", headers=other)).status_code == 404
    assert (await client.delete(f"/api/v1/notifications/{row.id}", headers=other)).status_code == 404
    assert (await client.get("/api/v1/notifications", headers=other)).json()["data"]["items"] == []
    assert (await client.get("/api/v1/notifications")).status_code == 401
    assert (await client.post(f"/api/v1/notifications/{row.id}/read", headers=auth_headers)).status_code == 200
    assert (await client.delete(f"/api/v1/notifications/{row.id}", headers=auth_headers)).status_code == 200


async def test_cleanup_purges_only_old_read_rows(client, db_session, test_user, monkeypatch):
    monkeypatch.setattr("app.config.settings.internal_api_key", "k")
    old = datetime.now(timezone.utc) - timedelta(days=90)
    mk = lambda **kw: Notification(recipient_id=test_user.id, type="list_featured", target_type="list",  # noqa: E731
                                   target_id=uuid.uuid4(), payload={}, **kw)
    db_session.add_all([mk(is_read=True, read_at=old), mk(is_read=True, read_at=datetime.now(timezone.utc)),
                        mk(is_read=False)])
    await db_session.commit()
    assert (await client.post("/api/v1/internal/notifications/cleanup")).status_code == 401
    res = await client.post("/api/v1/internal/notifications/cleanup", headers={"X-Internal-Api-Key": "k"})
    assert res.json()["data"]["deleted"] == 1
    assert await _count(db_session) == 2


async def test_delivery_failure_is_swallowed(monkeypatch):
    """_deliver is what runs after the like/comment committed: it must log, not raise."""

    def _broken_session():
        raise RuntimeError("db down")

    monkeypatch.setattr(notifications_service, "AsyncSessionLocal", _broken_session)
    await notifications_service._deliver({"type": "list_liked"})  # no exception
