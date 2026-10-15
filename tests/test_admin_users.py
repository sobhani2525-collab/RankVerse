"""
Admin user management (/admin/users): listing, stats, moderation, audit trail.
Run with: pytest tests/test_admin_users.py
"""
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.security import create_access_token, create_admin_access_token, hash_password
from app.modules.admin.models import AdminAccount, AdminAuditLog
from app.modules.entities.repository import EntityRepository
from app.modules.lists.models import ListComment, UserList
from app.modules.users.models import User, UserFavorite, UserRating

BASE = "/api/v1/admin/users"
PASSWORD = "Sup3rSecret!1"


@pytest_asyncio.fixture
async def admin(db_session):
    account = AdminAccount(email="admin@example.com", password_hash=hash_password("Sup3rSecret!1234"))
    db_session.add(account)
    await db_session.commit()
    return account


@pytest.fixture
def admin_headers(admin):
    return {"Authorization": f"Bearer {create_admin_access_token(str(admin.id))}"}


@pytest.fixture(autouse=True)
def _no_stats_cache(monkeypatch):
    monkeypatch.setattr("app.config.settings.cache_enabled", False)


async def _user(db, email, username, **fields) -> User:
    user = User(email=email, username=username, hashed_password=hash_password(PASSWORD), **fields)
    db.add(user)
    await db.commit()
    return user


def _assert_no_secrets(payload) -> None:
    text = str(payload).lower()
    assert "hashed_password" not in text and "password_hash" not in text


async def test_requires_admin_token(client, test_user, auth_headers):
    assert (await client.get(BASE)).status_code == 401
    assert (await client.get(f"{BASE}/stats")).status_code == 401
    assert (await client.get(f"{BASE}/{test_user.id}")).status_code == 401
    assert (await client.post(f"{BASE}/{test_user.id}/block", json={"reason": "x"})).status_code == 401
    # A regular user token is not an admin token.
    assert (await client.get(BASE, headers=auth_headers)).status_code == 401


async def test_list_search_filter_sort_paginate(client, db_session, admin_headers):
    now = datetime.now(timezone.utc)
    a = await _user(db_session, "alice@example.com", "alice", display_name="Alice A",
                    created_at=now - timedelta(days=10), last_login_at=now - timedelta(days=1),
                    email_verified_at=now)
    b = await _user(db_session, "bob@example.com", "bobby", created_at=now - timedelta(days=5))
    c = await _user(db_session, "carol@example.com", "carol", created_at=now - timedelta(days=2),
                    is_active=False)
    d = await _user(db_session, "dave@example.com", "dave", deleted_at=now)

    res = await client.get(BASE, headers=admin_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["meta"]["total"] == 3  # deleted hidden by default
    assert [r["username"] for r in body["data"]] == ["carol", "bobby", "alice"]
    assert {r["status"] for r in body["data"]} == {"active", "blocked"}
    _assert_no_secrets(body)

    async def names(**params):
        res = await client.get(BASE, headers=admin_headers, params=params)
        assert res.status_code == 200
        return [r["username"] for r in res.json()["data"]]

    assert await names(status="all", sort="username", order="asc") == ["alice", "bobby", "carol", "dave"]
    assert await names(status="deleted") == ["dave"]
    assert await names(status="blocked") == ["carol"]
    assert await names(status="active", sort="created_at", order="asc") == ["alice", "bobby"]
    assert await names(q="ALICE") == ["alice"]
    assert await names(q="alice a") == ["alice"]  # display name
    assert await names(q="example.com", sort="email", order="asc") == ["alice", "bobby", "carol"]
    assert await names(q=str(b.id)) == ["bobby"]
    assert await names(q="100%") == []  # wildcards are literal
    assert await names(email_verified="true") == ["alice"]
    assert await names(email_verified="false", sort="username", order="asc") == ["bobby", "carol"]
    assert await names(never_logged_in="true", sort="username", order="asc") == ["bobby", "carol"]
    assert await names(never_logged_in="false") == ["alice"]
    assert await names(created_from=(now - timedelta(days=6)).isoformat()) == ["carol", "bobby"]
    assert await names(created_to=(now - timedelta(days=6)).isoformat()) == ["alice"]
    assert await names(last_login_from=(now - timedelta(days=2)).isoformat()) == ["alice"]
    by_login = await names(sort="last_login_at", order="desc")
    assert by_login[0] == "alice" and set(by_login) == {"alice", "carol", "bobby"}  # never-logged-in rows tie

    page2 = await client.get(BASE, headers=admin_headers, params={"page": 2, "page_size": 2})
    assert [r["username"] for r in page2.json()["data"]] == ["alice"]
    assert page2.json()["meta"] == {"page": 2, "page_size": 2, "total": 3}

    assert (await client.get(BASE, headers=admin_headers, params={"sort": "hashed_password"})).status_code == 422
    assert (await client.get(BASE, headers=admin_headers, params={"page_size": 101})).status_code == 422


async def test_list_counts_and_count_sorting(client, db_session, admin_headers):
    repo = EntityRepository(db_session)
    movies = [
        await repo.create_entity(entity_type="movie", external_id=None, external_source=None,
                                 title=f"M{i}", slug=f"m{i}", attributes={})
        for i in range(3)
    ]
    busy = await _user(db_session, "busy@example.com", "busy")
    idle = await _user(db_session, "idle@example.com", "idle")
    for m in movies:
        db_session.add(UserRating(user_id=busy.id, entity_id=m.id, score=4))
    lst = UserList(user_id=busy.id, title="Mine", slug="mine")
    db_session.add(lst)
    await db_session.flush()
    db_session.add(ListComment(list_id=lst.id, user_id=busy.id, body="hello"))
    await db_session.commit()

    res = await client.get(BASE, headers=admin_headers, params={"sort": "ratings_count", "order": "desc"})
    rows = res.json()["data"]
    assert [r["username"] for r in rows] == ["busy", "idle"]
    assert (rows[0]["ratings_count"], rows[0]["lists_count"], rows[0]["comments_count"]) == (3, 1, 1)
    assert (rows[1]["ratings_count"], rows[1]["lists_count"], rows[1]["comments_count"]) == (0, 0, 0)

    res = await client.get(BASE, headers=admin_headers, params={"sort": "lists_count", "order": "desc"})
    assert res.json()["data"][0]["username"] == "busy"


async def test_stats(client, db_session, admin_headers):
    now = datetime.now(timezone.utc)
    await _user(db_session, "n1@example.com", "n1", created_at=now - timedelta(days=1), last_login_at=now,
                email_verified_at=now)
    await _user(db_session, "n2@example.com", "n2", created_at=now - timedelta(days=3))
    await _user(db_session, "p1@example.com", "p1", created_at=now - timedelta(days=9))  # previous 7d window
    await _user(db_session, "old@example.com", "old", created_at=now - timedelta(days=40), is_active=False)
    await _user(db_session, "gone@example.com", "gone", deleted_at=now)

    res = await client.get(f"{BASE}/stats", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["total"] == 4
    assert data["new_7d"] == 2 and data["new_7d_change_pct"] == 100.0
    assert data["new_30d"] == 3 and data["new_30d_change_pct"] == 200.0  # 1 user in the 30-60d window
    assert data["active_today"] == 1
    assert data["blocked"] == 1
    assert data["unverified"] == 3
    assert data["deleted"] == 1


async def test_detail(client, db_session, admin_headers):
    user = await _user(db_session, "d@example.com", "detail", bio="hi", admin_note="vip")
    res = await client.get(f"{BASE}/{user.id}", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["email"] == "d@example.com" and data["bio"] == "hi" and data["admin_note"] == "vip"
    assert data["favorites_count"] == 0 and data["battle_votes_count"] == 0
    _assert_no_secrets(res.json())
    missing = await client.get(f"{BASE}/00000000-0000-0000-0000-000000000000", headers=admin_headers)
    assert missing.status_code == 404


async def test_block_unblock_cuts_off_existing_tokens(client, db_session, admin, admin_headers, test_user, auth_headers):
    assert (await client.get("/api/v1/auth/me", headers=auth_headers)).status_code == 200

    res = await client.post(f"{BASE}/{test_user.id}/block", headers=admin_headers, json={"reason": "spam"})
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["status"] == "blocked" and data["blocked_reason"] == "spam"
    assert data["blocked_by_admin_email"] == "admin@example.com" and data["blocked_at"]

    # The token issued before the block stops working; login and refresh are closed too.
    assert (await client.get("/api/v1/auth/me", headers=auth_headers)).status_code == 401
    login = await client.post("/api/v1/auth/login", json={"email": test_user.email, "password": PASSWORD})
    assert login.status_code == 401
    refresh = await client.post("/api/v1/auth/refresh", params={"refresh_token": _refresh(test_user)})
    assert refresh.status_code == 401

    # Reason is mandatory; blocking again is idempotent (no second audit row).
    assert (await client.post(f"{BASE}/{test_user.id}/block", headers=admin_headers, json={})).status_code == 422
    assert (await client.post(f"{BASE}/{test_user.id}/block", headers=admin_headers, json={"reason": "  "})).status_code == 422
    again = await client.post(f"{BASE}/{test_user.id}/block", headers=admin_headers, json={"reason": "other"})
    assert again.status_code == 200 and again.json()["data"]["blocked_reason"] == "spam"
    logs = (await db_session.execute(select(AdminAuditLog).where(AdminAuditLog.action == "user.block"))).scalars().all()
    assert len(logs) == 1

    res = await client.post(f"{BASE}/{test_user.id}/unblock", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["data"]["status"] == "active" and res.json()["data"]["blocked_reason"] is None
    assert (await client.get("/api/v1/auth/me", headers=auth_headers)).status_code == 200
    login = await client.post("/api/v1/auth/login", json={"email": test_user.email, "password": PASSWORD})
    assert login.status_code == 200
    assert (await client.post(f"{BASE}/{test_user.id}/unblock", headers=admin_headers)).status_code == 200


def _refresh(user) -> str:
    from app.core.security import create_refresh_token

    return create_refresh_token(str(user.id))


async def test_login_records_last_login(client, db_session, test_user):
    assert test_user.last_login_at is None
    res = await client.post("/api/v1/auth/login", json={"email": test_user.email, "password": PASSWORD})
    assert res.status_code == 200
    await db_session.refresh(test_user)
    assert test_user.last_login_at is not None


async def test_soft_delete_and_restore(client, db_session, admin_headers, test_user, auth_headers):
    pub = await client.get(f"/api/v1/users/{test_user.username}")
    assert pub.status_code == 200

    res = await client.delete(f"{BASE}/{test_user.id}", headers=admin_headers)
    assert res.status_code == 200 and res.json()["data"]["status"] == "deleted"
    # Idempotent.
    assert (await client.delete(f"{BASE}/{test_user.id}", headers=admin_headers)).status_code == 200

    assert (await client.get(f"/api/v1/users/{test_user.username}")).status_code == 404
    assert (await client.get(f"/api/v1/users/{test_user.username}/lists")).status_code == 404
    assert (await client.get("/api/v1/auth/me", headers=auth_headers)).status_code == 401
    login = await client.post("/api/v1/auth/login", json={"email": test_user.email, "password": PASSWORD})
    assert login.status_code == 401
    assert (await client.post(f"{BASE}/{test_user.id}/block", headers=admin_headers, json={"reason": "x"})).status_code == 400

    hidden = await client.get(BASE, headers=admin_headers)
    assert hidden.json()["meta"]["total"] == 0
    shown = await client.get(BASE, headers=admin_headers, params={"status": "deleted"})
    assert shown.json()["meta"]["total"] == 1

    res = await client.post(f"{BASE}/{test_user.id}/restore", headers=admin_headers)
    assert res.status_code == 200 and res.json()["data"]["status"] == "active"
    assert (await client.post(f"{BASE}/{test_user.id}/restore", headers=admin_headers)).status_code == 200
    assert (await client.get(f"/api/v1/users/{test_user.username}")).status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=auth_headers)).status_code == 200

    actions = (await db_session.execute(
        select(AdminAuditLog.action).where(AdminAuditLog.action.in_(("user.delete", "user.restore")))
    )).scalars().all()
    assert sorted(actions) == ["user.delete", "user.restore"]


async def test_delete_keeps_blocked_state_on_restore(client, admin_headers, test_user):
    await client.post(f"{BASE}/{test_user.id}/block", headers=admin_headers, json={"reason": "r"})
    await client.delete(f"{BASE}/{test_user.id}", headers=admin_headers)
    res = await client.post(f"{BASE}/{test_user.id}/restore", headers=admin_headers)
    assert res.json()["data"]["status"] == "blocked"


async def test_patch_updates_and_checks_uniqueness(client, db_session, admin_headers, test_user):
    other = await _user(db_session, "other@example.com", "other")

    res = await client.patch(f"{BASE}/{test_user.id}", headers=admin_headers, json={"email": "OTHER@example.com"})
    assert res.status_code == 409
    res = await client.patch(f"{BASE}/{test_user.id}", headers=admin_headers, json={"username": "Other"})
    assert res.status_code == 409
    assert (await client.patch(f"{BASE}/{test_user.id}", headers=admin_headers, json={"email": None})).status_code == 400
    assert (await client.patch(f"{BASE}/{test_user.id}", headers=admin_headers, json={"email": "nope"})).status_code == 422

    # Keeping your own values is not a clash.
    ok = await client.patch(f"{BASE}/{test_user.id}", headers=admin_headers, json={"username": "tester"})
    assert ok.status_code == 200

    await db_session.refresh(test_user)
    test_user.email_verified_at = datetime.now(timezone.utc)
    await db_session.commit()
    res = await client.patch(
        f"{BASE}/{test_user.id}", headers=admin_headers,
        json={"display_name": " New Name ", "bio": "", "email": "fresh@example.com", "admin_note": "watch"},
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["display_name"] == "New Name" and data["bio"] is None
    assert data["email"] == "fresh@example.com" and data["admin_note"] == "watch"
    assert data["email_verified"] is False  # the new address is unproven
    _assert_no_secrets(res.json())
    assert other.email == "other@example.com"


async def test_audit_records_only_changes_and_no_secrets(client, db_session, admin, admin_headers, test_user):
    res = await client.patch(
        f"{BASE}/{test_user.id}", headers={**admin_headers, "User-Agent": "pytest-agent", "X-Forwarded-For": "203.0.113.9, 10.0.0.1"},
        json={"display_name": "Zed", "bio": None},
    )
    assert res.status_code == 200

    log = (await db_session.execute(select(AdminAuditLog).where(AdminAuditLog.action == "user.update"))).scalar_one()
    assert log.admin_id == admin.id and log.admin_email == "admin@example.com"
    assert (log.target_type, log.target_id) == ("user", str(test_user.id))
    assert log.before == {"display_name": None} and log.after == {"display_name": "Zed"}
    assert log.ip == "203.0.113.9" and log.user_agent == "pytest-agent"
    _assert_no_secrets([log.before, log.after])

    # No-op edits write nothing.
    await client.patch(f"{BASE}/{test_user.id}", headers=admin_headers, json={"display_name": "Zed"})
    count = len((await db_session.execute(select(AdminAuditLog))).scalars().all())
    assert count == 1

    res = await client.get(f"{BASE}/{test_user.id}/audit-logs", headers=admin_headers)
    assert res.status_code == 200
    rows = res.json()["data"]
    assert len(rows) == 1 and rows[0]["action"] == "user.update" and rows[0]["after"] == {"display_name": "Zed"}
    assert res.json()["meta"]["total"] == 1
    _assert_no_secrets(res.json())


async def test_audit_service_strips_sensitive_keys(db_session, admin):
    from app.modules.admin.audit import AuditLogService

    row = await AuditLogService(db_session).record(
        admin, "x.y", "thing", "1",
        before={"hashed_password": "h", "name": "a"}, after={"token": "t", "name": "b"},
    )
    assert row.before == {"name": "a"} and row.after == {"name": "b"}


async def test_verify_email(client, db_session, admin_headers, test_user):
    assert test_user.email_verified_at is None
    res = await client.post(f"{BASE}/{test_user.id}/verify-email", headers=admin_headers)
    assert res.status_code == 200 and res.json()["data"]["email_verified"] is True
    assert (await client.post(f"{BASE}/{test_user.id}/verify-email", headers=admin_headers)).status_code == 200
    logs = (await db_session.execute(select(AdminAuditLog).where(AdminAuditLog.action == "user.verify_email"))).scalars().all()
    assert len(logs) == 1


async def test_send_password_reset(client, db_session, admin_headers, test_user, monkeypatch):
    sent = []

    async def fake_send(to, subject, text, html=None):
        sent.append((to, text))
        return True

    monkeypatch.setattr("app.modules.admin.users_router.send_email", fake_send)
    res = await client.post(f"{BASE}/{test_user.id}/send-password-reset", headers=admin_headers)
    assert res.status_code == 200 and res.json()["data"]["sent"] is True
    assert sent and sent[0][0] == test_user.email and "reset-password?token=" in sent[0][1]
    logs = (await db_session.execute(select(AdminAuditLog).where(AdminAuditLog.action == "user.send_password_reset"))).scalars().all()
    assert len(logs) == 1 and logs[0].after is None  # the link never lands in the log

    await client.delete(f"{BASE}/{test_user.id}", headers=admin_headers)
    assert (await client.post(f"{BASE}/{test_user.id}/send-password-reset", headers=admin_headers)).status_code == 400


async def test_activity(client, db_session, admin_headers, test_user):
    repo = EntityRepository(db_session)
    movie = await repo.create_entity(entity_type="movie", external_id=None, external_source=None,
                                     title="Heat", slug="heat", attributes={})
    db_session.add(UserRating(user_id=test_user.id, entity_id=movie.id, score=5))
    db_session.add(UserFavorite(user_id=test_user.id, entity_id=movie.id))
    lst = UserList(user_id=test_user.id, title="Faves", slug="faves")
    db_session.add(lst)
    await db_session.flush()
    db_session.add(ListComment(list_id=lst.id, user_id=test_user.id, body="nice list"))
    await db_session.commit()

    async def rows(kind):
        res = await client.get(f"{BASE}/{test_user.id}/activity", headers=admin_headers, params={"kind": kind})
        assert res.status_code == 200
        assert res.json()["meta"]["total"] == 1
        return res.json()["data"]

    assert (await rows("ratings"))[0]["score"] == 5 and (await rows("ratings"))[0]["entity_title"] == "Heat"
    assert (await rows("favorites"))[0]["entity_slug"] == "heat"
    assert (await rows("lists"))[0]["title"] == "Faves"
    comment = (await rows("comments"))[0]
    assert comment["body"] == "nice list" and comment["target_kind"] == "list" and comment["target_title"] == "Faves"

    bad = await client.get(f"{BASE}/{test_user.id}/activity", headers=admin_headers, params={"kind": "nope"})
    assert bad.status_code == 422


# --- bulk & export ----------------------------------------------------------

import csv
import io
import json as _json


async def _many(db, n, prefix="bulk"):
    return [await _user(db, f"{prefix}{i}@example.com", f"{prefix}{i}") for i in range(n)]


async def test_bulk_by_ids_reports_succeeded_skipped_failed(client, db_session, admin_headers):
    a, b, c = await _many(db_session, 3)
    b.is_active = False  # already blocked -> skipped
    c.deleted_at = datetime.now(timezone.utc)  # deleted -> failed
    await db_session.commit()
    missing = "00000000-0000-0000-0000-000000000000"

    res = await client.post(
        f"{BASE}/bulk", headers=admin_headers,
        json={"action": "block", "ids": [str(a.id), str(b.id), str(c.id), missing, str(a.id)], "reason": "spam wave"},
    )
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["succeeded"] == [str(a.id)]
    assert data["skipped"] == [str(b.id)]
    assert {f["id"] for f in data["failed"]} == {str(c.id), missing}

    await db_session.refresh(a)
    assert a.is_active is False and a.blocked_reason == "spam wave"
    logs = (await db_session.execute(select(AdminAuditLog).where(AdminAuditLog.action == "user.block"))).scalars().all()
    assert len(logs) == 1 and logs[0].after["bulk"] is True and logs[0].target_id == str(a.id)


async def test_bulk_validation(client, db_session, admin_headers):
    (a,) = await _many(db_session, 1)
    ids = [str(a.id)]
    assert (await client.post(f"{BASE}/bulk", headers=admin_headers, json={"action": "block", "ids": ids})).status_code == 422
    assert (await client.post(f"{BASE}/bulk", headers=admin_headers, json={"action": "delete"})).status_code == 422
    both = {"action": "delete", "ids": ids, "filter": {}}
    assert (await client.post(f"{BASE}/bulk", headers=admin_headers, json=both)).status_code == 422
    too_many = {"action": "delete", "ids": [f"00000000-0000-0000-0000-{i:012d}" for i in range(501)]}
    assert (await client.post(f"{BASE}/bulk", headers=admin_headers, json=too_many)).status_code == 422
    assert (await client.post(f"{BASE}/bulk", json={"action": "delete", "ids": ids})).status_code == 401


async def test_bulk_by_filter_covers_every_match(client, db_session, admin_headers):
    users = await _many(db_session, 5, "grp")
    await _user(db_session, "other@example.com", "other")

    res = await client.post(f"{BASE}/bulk", headers=admin_headers, json={"action": "verify_email", "filter": {"q": "grp"}})
    assert res.status_code == 200
    assert sorted(res.json()["data"]["succeeded"]) == sorted(str(u.id) for u in users)
    verified = (await client.get(BASE, headers=admin_headers, params={"email_verified": "true"})).json()["meta"]["total"]
    assert verified == 5

    res = await client.post(f"{BASE}/bulk", headers=admin_headers, json={"action": "delete", "filter": {"status": "active", "q": "grp"}})
    assert len(res.json()["data"]["succeeded"]) == 5
    res = await client.post(f"{BASE}/bulk", headers=admin_headers, json={"action": "restore", "filter": {"status": "deleted"}})
    assert len(res.json()["data"]["succeeded"]) == 5
    res = await client.post(f"{BASE}/bulk", headers=admin_headers, json={"action": "unblock", "filter": {"q": "grp"}})
    assert len(res.json()["data"]["skipped"]) == 5


async def test_bulk_filter_cap(client, db_session, admin_headers, monkeypatch):
    monkeypatch.setattr("app.modules.admin.users_service.BULK_FILTER_CAP", 2)
    await _many(db_session, 3)
    res = await client.post(f"{BASE}/bulk", headers=admin_headers, json={"action": "delete", "filter": {}})
    assert res.status_code == 400


def _csv_rows(res):
    assert res.content.startswith(b"\xef\xbb\xbf")  # UTF-8 BOM so Excel reads Persian text
    return list(csv.DictReader(io.StringIO(res.content.decode("utf-8-sig"))))


async def test_export_csv_respects_filters_and_hides_secrets(client, db_session, admin_headers):
    await _user(db_session, "fa@example.com", "fa_user", display_name="علی رضایی")
    await _user(db_session, "x@example.com", "xuser", display_name="=HYPERLINK(1)")
    await _user(db_session, "gone@example.com", "gone", deleted_at=datetime.now(timezone.utc))

    res = await client.get(f"{BASE}/export", headers=admin_headers, params={"sort": "username", "order": "asc"})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert 'attachment; filename="rankverse-users-' in res.headers["content-disposition"]
    rows = _csv_rows(res)
    assert [r["username"] for r in rows] == ["fa_user", "xuser"]
    assert rows[0]["display_name"] == "علی رضایی" and rows[0]["email"] == "fa@example.com"
    assert rows[1]["display_name"] == "'=HYPERLINK(1)"  # formula neutralised
    assert set(rows[0]) == {
        "id", "email", "username", "display_name", "status", "email_verified",
        "created_at", "last_login_at", "ratings_count", "lists_count", "comments_count",
    }
    _assert_no_secrets(res.text)

    res = await client.get(f"{BASE}/export", headers=admin_headers, params={"q": "xuser", "columns": "username,status"})
    assert _csv_rows(res) == [{"username": "xuser", "status": "active"}]
    res = await client.get(f"{BASE}/export", headers=admin_headers, params={"status": "deleted", "columns": "username"})
    assert [r["username"] for r in _csv_rows(res)] == ["gone"]


async def test_export_json_selected_ids_and_audit(client, db_session, admin_headers):
    a, b, _c = await _many(db_session, 3, "pick")
    res = await client.get(
        f"{BASE}/export", headers=admin_headers,
        params={"format": "json", "ids": f"{a.id},{b.id}", "columns": "id,email,ratings_count", "sort": "email", "order": "asc"},
    )
    assert res.status_code == 200 and res.headers["content-type"].startswith("application/json")
    assert _json.loads(res.content) == [
        {"id": str(a.id), "email": a.email, "ratings_count": 0},
        {"id": str(b.id), "email": b.email, "ratings_count": 0},
    ]
    log = (await db_session.execute(select(AdminAuditLog).where(AdminAuditLog.action == "user.export"))).scalar_one()
    assert log.after["rows"] == 2 and log.after["format"] == "json" and log.after["selected_ids"] == 2

    empty = await client.get(f"{BASE}/export", headers=admin_headers, params={"format": "json", "q": "nobody-matches"})
    assert _json.loads(empty.content) == []


async def test_export_guards(client, db_session, admin_headers, monkeypatch):
    await _many(db_session, 3)
    assert (await client.get(f"{BASE}/export")).status_code == 401
    bad = await client.get(f"{BASE}/export", headers=admin_headers, params={"columns": "email,hashed_password"})
    assert bad.status_code == 400
    assert (await client.get(f"{BASE}/export", headers=admin_headers, params={"ids": "nope"})).status_code == 400
    monkeypatch.setattr("app.modules.admin.users_service.EXPORT_ROW_CAP", 2)
    over = await client.get(f"{BASE}/export", headers=admin_headers)
    assert over.status_code == 400 and "limit" in over.json()["error"]["message"]
