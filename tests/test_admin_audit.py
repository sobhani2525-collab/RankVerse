"""
Admin audit log: the read API (/admin/audit-logs) and the existing admin
actions (list curation, daily battle, admin login / password change) writing
to it. Run with: pytest tests/test_admin_audit.py
"""
import csv
import io
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.redis import get_redis
from app.core.security import create_admin_access_token, hash_password
from app.modules.admin.audit import AuditLogService
from app.modules.admin.models import AdminAccount, AdminAuditLog
from app.modules.daily_battle import tehran
from app.modules.entities.repository import EntityRepository
from app.modules.lists.models import UserList, UserListItem

BASE = "/api/v1/admin"
AUDIT = f"{BASE}/audit-logs"
ADMIN_PASSWORD = "Sup3rSecret!1234"
NOW = datetime(2026, 10, 3, 9, 0, tzinfo=timezone.utc)


class FakeRedis:
    async def incr(self, key):
        return 1

    async def expire(self, key, seconds):
        return True


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    from app.main import app

    app.dependency_overrides[get_redis] = lambda: FakeRedis()
    monkeypatch.setattr(tehran, "utcnow", lambda: NOW)
    monkeypatch.setattr("app.config.settings.cache_enabled", False)
    yield
    app.dependency_overrides.pop(get_redis, None)


@pytest_asyncio.fixture
async def admin(db_session):
    account = AdminAccount(email="admin@example.com", password_hash=hash_password(ADMIN_PASSWORD))
    db_session.add(account)
    await db_session.commit()
    return account


@pytest.fixture
def admin_headers(admin):
    return {"Authorization": f"Bearer {create_admin_access_token(str(admin.id))}"}


async def _logs(db, action=None):
    stmt = select(AdminAuditLog).order_by(AdminAuditLog.created_at, AdminAuditLog.id)
    if action:
        stmt = stmt.where(AdminAuditLog.action == action)
    return list((await db.execute(stmt)).scalars().all())


async def _list_with_items(db, owner, n=3, slug="curated"):
    repo = EntityRepository(db)
    lst = UserList(user_id=owner.id, title="Curated List", slug=slug)
    db.add(lst)
    await db.flush()
    items = []
    for i in range(n):
        movie = await repo.create_entity(
            entity_type="movie", external_id=None, external_source=None,
            title=f"{slug} m{i}", slug=f"{slug}-m{i}", attributes={},
        )
        item = UserListItem(list_id=lst.id, entity_id=movie.id, entity_type="movie", position=i + 1, added_by_user_id=owner.id)
        db.add(item)
        items.append(item)
    await db.commit()
    return lst, items


# --- existing admin actions now write audit rows -----------------------------

async def test_admin_login_and_password_change_are_logged(client, db_session, admin):
    res = await client.post(
        f"{BASE}/auth/login", json={"email": admin.email, "password": ADMIN_PASSWORD},
        headers={"X-Forwarded-For": "198.51.100.7", "User-Agent": "audit-test"},
    )
    assert res.status_code == 200
    (login,) = await _logs(db_session, "admin.login")
    assert login.admin_id == admin.id and login.target_type == "admin" and login.target_id == str(admin.id)
    assert login.ip == "198.51.100.7" and login.user_agent == "audit-test"

    bad = await client.post(f"{BASE}/auth/login", json={"email": admin.email, "password": "wrong-password-123"})
    assert bad.status_code == 401
    assert len(await _logs(db_session, "admin.login")) == 1  # failures are not recorded

    token = res.json()["data"]["access_token"]
    res = await client.patch(
        f"{BASE}/auth/password", headers={"Authorization": f"Bearer {token}"},
        json={"current_password": ADMIN_PASSWORD, "new_password": "An0therSecret!5678"},
    )
    assert res.status_code == 200
    (change,) = await _logs(db_session, "admin.password_change")
    assert change.before is None and change.after is None  # never the passwords


async def test_list_curation_actions_are_logged(client, db_session, admin_headers, test_user):
    lst, items = await _list_with_items(db_session, test_user)

    res = await client.patch(f"{BASE}/lists/{lst.id}", headers=admin_headers, json={"is_hidden_from_discovery": True, "curation_note": "meh"})
    assert res.status_code == 200
    (row,) = await _logs(db_session, "list.update")
    assert (row.target_type, row.target_id) == ("list", str(lst.id))
    assert row.before == {"is_hidden_from_discovery": False, "curation_note": None}
    assert row.after == {"is_hidden_from_discovery": True, "curation_note": "meh"}

    # A no-op PATCH logs nothing.
    await client.patch(f"{BASE}/lists/{lst.id}", headers=admin_headers, json={"is_hidden_from_discovery": True})
    assert len(await _logs(db_session, "list.update")) == 1

    ids = [str(i.id) for i in reversed(items)]
    res = await client.put(f"{BASE}/lists/{lst.id}/items/reorder", headers=admin_headers, json={"item_ids": ids})
    assert res.status_code == 200
    (reorder,) = await _logs(db_session, "list.items_reorder")
    assert reorder.after == {"item_ids": ids}

    res = await client.delete(f"{BASE}/lists/{lst.id}/items/{items[0].id}", headers=admin_headers)
    assert res.status_code == 200
    (removed,) = await _logs(db_session, "list.item_remove")
    assert removed.before["item_id"] == str(items[0].id)

    res = await client.delete(f"{BASE}/lists/{lst.id}", headers=admin_headers)
    assert res.status_code == 200
    (deleted,) = await _logs(db_session, "list.delete")
    assert deleted.before == {"title": "Curated List", "slug": "curated"}


async def test_featured_reorder_is_logged(client, db_session, admin_headers, test_user):
    a, _ = await _list_with_items(db_session, test_user, slug="fa-list")
    b, _ = await _list_with_items(db_session, test_user, slug="fb-list")
    for lst in (a, b):
        assert (await client.patch(f"{BASE}/lists/{lst.id}", headers=admin_headers, json={"is_featured": True})).status_code == 200
    res = await client.post(f"{BASE}/lists/featured/reorder", headers=admin_headers, json={"ids": [str(b.id), str(a.id)]})
    assert res.status_code == 200
    (row,) = await _logs(db_session, "list.featured_reorder")
    assert row.after == {"ids": [str(b.id), str(a.id)]}


async def test_daily_battle_actions_are_logged(client, db_session, admin_headers):
    repo = EntityRepository(db_session)
    movies = [
        await repo.create_entity(entity_type="movie", external_id=None, external_source=None,
                                 title=f"DB {i}", slug=f"db-audit-{i}", attributes={})
        for i in range(3)
    ]
    await db_session.commit()
    tomorrow = (date(2026, 10, 3) + timedelta(days=1)).isoformat()

    res = await client.post(
        f"{BASE}/daily-battles", headers=admin_headers,
        json={"battle_date": tomorrow, "left_id": str(movies[0].id), "right_id": str(movies[1].id)},
    )
    assert res.status_code == 201
    battle_id = res.json()["data"]["id"]
    (created,) = await _logs(db_session, "daily_battle.create")
    assert created.target_id == battle_id and created.after["battle_date"] == tomorrow

    res = await client.put(f"{BASE}/daily-battles/{battle_id}", headers=admin_headers, json={"right_id": str(movies[2].id)})
    assert res.status_code == 200
    (updated,) = await _logs(db_session, "daily_battle.update")
    assert updated.before == {"right_id": str(movies[1].id)} and updated.after == {"right_id": str(movies[2].id)}

    res = await client.delete(f"{BASE}/daily-battles/{battle_id}", headers=admin_headers)
    assert res.status_code == 200
    (deleted,) = await _logs(db_session, "daily_battle.delete")
    assert deleted.before["left_id"] == str(movies[0].id)


# --- read API ----------------------------------------------------------------

async def _seed(db, admin, other):
    audit = AuditLogService(db)
    rows = [
        await audit.record(admin, "user.block", "user", "u-1", before={"status": "active"}, after={"status": "blocked"}),
        await audit.record(admin, "list.update", "list", "l-1", after={"curation_note": "x"}),
        await audit.record(other, "user.delete", "user", "u-2"),
    ]
    for i, row in enumerate(rows):  # one transaction shares now(); space them out, oldest first
        row.created_at = NOW + timedelta(minutes=i)
    await db.commit()


@pytest_asyncio.fixture
async def other_admin(db_session):
    account = AdminAccount(email="second@example.com", password_hash=hash_password(ADMIN_PASSWORD))
    db_session.add(account)
    await db_session.commit()
    return account


async def test_audit_api_requires_admin(client, auth_headers):
    for path in (AUDIT, f"{AUDIT}/admins", f"{AUDIT}/export"):
        assert (await client.get(path)).status_code == 401
        assert (await client.get(path, headers=auth_headers)).status_code == 401


async def test_audit_list_filters_order_and_pagination(client, db_session, admin, other_admin, admin_headers):
    await _seed(db_session, admin, other_admin)

    async def get(**params):
        res = await client.get(AUDIT, headers=admin_headers, params=params)
        assert res.status_code == 200
        return res.json()

    body = await get()
    assert [r["action"] for r in body["data"]] == ["user.delete", "list.update", "user.block"]  # newest first
    assert body["meta"]["total"] == 3
    assert "password" not in str(body).lower()

    assert [r["target_id"] for r in (await get(admin_id=str(other_admin.id)))["data"]] == ["u-2"]
    both = await get(action=["user.block", "user.delete"])
    assert {r["action"] for r in both["data"]} == {"user.block", "user.delete"}
    assert [r["action"] for r in (await get(target_type="list"))["data"]] == ["list.update"]
    assert [r["action"] for r in (await get(target_type="user", target_id="u-1"))["data"]] == ["user.block"]
    assert [r["admin_email"] for r in (await get(q="SECOND"))["data"]] == ["second@example.com"]
    assert [r["target_id"] for r in (await get(q="l-1"))["data"]] == ["l-1"]
    assert (await get(q="%"))["meta"]["total"] == 0  # wildcards are literal

    after_first = (NOW + timedelta(minutes=1)).isoformat()
    assert [r["action"] for r in (await get(created_from=after_first))["data"]] == ["user.delete", "list.update"]
    assert [r["action"] for r in (await get(created_to=after_first))["data"]] == ["list.update", "user.block"]

    page2 = await get(page=2, page_size=2)
    assert [r["action"] for r in page2["data"]] == ["user.block"]
    assert page2["meta"] == {"page": 2, "page_size": 2, "total": 3}
    assert (await client.get(AUDIT, headers=admin_headers, params={"page_size": 101})).status_code == 422

    res = await client.get(f"{AUDIT}/admins", headers=admin_headers)
    assert [a["email"] for a in res.json()["data"]] == ["admin@example.com", "second@example.com"]


async def test_audit_log_is_append_only(client, admin_headers):
    from app.main import app

    methods = set()
    for route in app.routes:
        if getattr(route, "path", "").startswith("/api/v1/admin/audit-logs"):
            methods |= route.methods - {"HEAD", "OPTIONS"}
    assert methods == {"GET"}

    for verb in ("post", "put", "patch", "delete"):
        res = await getattr(client, verb)(AUDIT, headers=admin_headers)
        assert res.status_code in (404, 405)


def _csv(res):
    assert res.content.startswith(b"\xef\xbb\xbf")
    return list(csv.DictReader(io.StringIO(res.content.decode("utf-8-sig"))))


async def test_audit_export_csv(client, db_session, admin, other_admin, admin_headers, monkeypatch):
    await _seed(db_session, admin, other_admin)

    res = await client.get(f"{AUDIT}/export", headers=admin_headers, params={"target_type": "user"})
    assert res.status_code == 200 and res.headers["content-type"].startswith("text/csv")
    assert 'filename="rankverse-audit-log-' in res.headers["content-disposition"]
    rows = _csv(res)
    assert {r["action"] for r in rows} == {"user.block", "user.delete"}
    block = next(r for r in rows if r["action"] == "user.block")
    assert block["admin_email"] == "admin@example.com" and '"blocked"' in block["after"]
    assert list(rows[0]) == ["created_at", "admin_email", "action", "target_type", "target_id", "ip", "user_agent", "before", "after"]

    (export_event,) = await _logs(db_session, "audit_log.export")
    assert export_event.admin_id == admin.id and export_event.after["rows"] == 2

    monkeypatch.setattr("app.modules.admin.audit_router.EXPORT_ROW_CAP", 1)
    over = await client.get(f"{AUDIT}/export", headers=admin_headers)
    assert over.status_code == 400 and "limit" in over.json()["error"]["message"]
