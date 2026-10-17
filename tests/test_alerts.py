"""
Admin operational alerts: dedup by fingerprint, cooldown reopen, channels,
recursion guard, admin-only access, brute-force detection, 500 hook.
Run with: TEST_DATABASE_URL=... pytest tests/test_alerts.py
"""
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import func, select

from app.core import database
from app.core.security import create_admin_access_token, hash_password
from app.modules.admin.models import AdminAccount
from app.modules.alerts import service as alerts_service
from app.modules.alerts.models import AdminAlert


@pytest.fixture(autouse=True)
def _alerts_on_test_transaction(monkeypatch, db_session):
    @asynccontextmanager
    async def _session():
        yield db_session

    monkeypatch.setattr(database, "AsyncSessionLocal", _session)
    sent = []

    class _Capture:
        async def send(self, alert):
            sent.append(alert)

    monkeypatch.setattr(alerts_service, "build_channels", lambda: [_Capture()])
    alerts_service._login_failures.clear()
    return sent


@pytest.fixture
def sent(_alerts_on_test_transaction):
    return _alerts_on_test_transaction


@pytest_asyncio.fixture
async def admin_headers(db_session):
    admin = AdminAccount(email="admin@example.com", password_hash=hash_password("Sup3rSecret!1234"))
    db_session.add(admin)
    await db_session.commit()
    return {"Authorization": f"Bearer {create_admin_access_token(str(admin.id))}"}


async def _rows(db):
    return (await db.execute(select(AdminAlert))).scalars().all()


async def test_repeat_alert_bumps_counters_and_notifies_once(db_session, sent):
    for _ in range(3):
        await alerts_service.raise_alert("warning", "http_500", "boom", {"n": 1}, fingerprint="fp1")
    rows = await _rows(db_session)
    assert len(rows) == 1 and rows[0].occurrences == 3
    assert rows[0].last_seen_at >= rows[0].first_seen_at
    assert len(sent) == 1  # channels only fire for the first occurrence


async def test_severity_escalates_but_never_downgrades(db_session):
    await alerts_service.raise_alert("warning", "db", "x", fingerprint="fp2")
    await alerts_service.raise_alert("critical", "db", "x", fingerprint="fp2")
    await alerts_service.raise_alert("info", "db", "x", fingerprint="fp2")
    assert (await _rows(db_session))[0].severity == "critical"


async def test_resolved_alert_reopens_quietly_inside_cooldown_and_is_new_after(db_session, sent):
    await alerts_service.raise_alert("warning", "sync", "s", fingerprint="fp3")
    alert = (await _rows(db_session))[0]
    alert.resolved_at = datetime.now(timezone.utc)
    await db_session.commit()

    await alerts_service.raise_alert("warning", "sync", "s", fingerprint="fp3")
    rows = await _rows(db_session)
    assert len(rows) == 1 and rows[0].resolved_at is None and rows[0].occurrences == 2 and len(sent) == 1

    rows[0].resolved_at = datetime.now(timezone.utc) - timedelta(days=1)
    await db_session.commit()
    await alerts_service.raise_alert("warning", "sync", "s", fingerprint="fp3")
    assert len(await _rows(db_session)) == 2 and len(sent) == 2


async def test_raise_alert_never_raises_and_does_not_recurse(monkeypatch, db_session):
    async def _explode(*a, **k):
        raise RuntimeError("db is gone")

    monkeypatch.setattr(alerts_service.AlertService, "record", _explode)
    await alerts_service.raise_alert("critical", "db", "x")  # swallowed

    token = alerts_service._in_alert.set(True)
    try:
        await alerts_service.raise_alert("critical", "db", "inside")  # ignored while already alerting
    finally:
        alerts_service._in_alert.reset(token)
    assert await _rows(db_session) == []


async def test_failing_channel_does_not_lose_the_alert(monkeypatch, db_session):
    class _Broken:
        async def send(self, alert):
            raise RuntimeError("webhook down")

    monkeypatch.setattr(alerts_service, "build_channels", lambda: [_Broken()])
    await alerts_service.raise_alert("critical", "db", "kept", fingerprint="fp4")
    assert len(await _rows(db_session)) == 1


def test_webhook_channel_only_when_configured(monkeypatch):
    monkeypatch.undo()
    monkeypatch.setattr("app.config.settings.alert_webhook_url", "")
    assert [type(c).__name__ for c in alerts_service.build_channels()] == ["LogChannel"]
    monkeypatch.setattr("app.config.settings.alert_webhook_url", "https://example.test/hook")
    assert [type(c).__name__ for c in alerts_service.build_channels()] == ["LogChannel", "WebhookChannel"]


async def test_admin_api_requires_admin_token(client, db_session, auth_headers, admin_headers):
    await alerts_service.raise_alert("critical", "db", "visible", fingerprint="fp5")
    assert (await client.get("/api/v1/admin/alerts")).status_code == 401
    assert (await client.get("/api/v1/admin/alerts", headers=auth_headers)).status_code == 401  # user token
    res = await client.get("/api/v1/admin/alerts", headers=admin_headers)
    assert res.status_code == 200 and res.json()["data"][0]["title"] == "visible"
    assert (await client.get("/api/v1/admin/alerts/open-count", headers=admin_headers)).json()["data"]["count"] == 1


async def test_acknowledge_and_resolve_flow_with_filters(client, db_session, admin_headers):
    await alerts_service.raise_alert("critical", "db", "a", fingerprint="fa")
    await alerts_service.raise_alert("info", "sync", "b", fingerprint="fb")
    alert_a = (await db_session.execute(select(AdminAlert).where(AdminAlert.fingerprint == "fa"))).scalar_one()

    crit = await client.get("/api/v1/admin/alerts?severity=critical", headers=admin_headers)
    assert [a["title"] for a in crit.json()["data"]] == ["a"]

    ack = await client.post(f"/api/v1/admin/alerts/{alert_a.id}/acknowledge", headers=admin_headers)
    assert ack.json()["data"]["acknowledged_at"] is not None and ack.json()["data"]["resolved_at"] is None
    unacked = await client.get("/api/v1/admin/alerts?status=unacknowledged", headers=admin_headers)
    assert [a["title"] for a in unacked.json()["data"]] == ["b"]

    await client.post(f"/api/v1/admin/alerts/{alert_a.id}/resolve", headers=admin_headers)
    assert (await client.get("/api/v1/admin/alerts/open-count", headers=admin_headers)).json()["data"]["count"] == 1
    resolved = await client.get("/api/v1/admin/alerts?status=resolved", headers=admin_headers)
    assert [a["title"] for a in resolved.json()["data"]] == ["a"]


async def test_brute_force_logins_raise_a_critical_alert(monkeypatch, db_session):
    monkeypatch.setattr("app.config.settings.alert_admin_login_fail_threshold", 3)
    scheduled = []
    monkeypatch.setattr(alerts_service, "raise_alert_nowait", lambda *a, **k: scheduled.append((a, k)))
    for _ in range(2):
        alerts_service.note_admin_login_failure("1.2.3.4", "x@y.z")
    assert scheduled == []
    alerts_service.note_admin_login_failure("1.2.3.4", "x@y.z")
    assert len(scheduled) == 1 and scheduled[0][0][0] == "critical"
    assert scheduled[0][1]["fingerprint"] == "admin_login:1.2.3.4"


async def test_unhandled_500_becomes_an_alert(monkeypatch):
    from app.core.exceptions import unhandled_exception_handler
    from starlette.requests import Request

    calls = []
    monkeypatch.setattr(alerts_service, "raise_alert_nowait", lambda *a, **k: calls.append((a, k)))
    request = Request({"type": "http", "method": "GET", "path": "/api/v1/boom", "headers": [], "query_string": b""})
    response = await unhandled_exception_handler(request, ValueError("kaboom"))
    assert response.status_code == 500
    assert calls and calls[0][1]["fingerprint"] == "http_500:GET:/api/v1/boom:ValueError"


async def test_maintenance_purges_old_resolved_alerts(client, db_session, monkeypatch):
    monkeypatch.setattr("app.config.settings.internal_api_key", "k")
    monkeypatch.setattr("app.config.settings.alert_db_size_warn_mb", 0)
    old = datetime.now(timezone.utc) - timedelta(days=400)
    db_session.add(AdminAlert(severity="info", source="x", title="old", fingerprint="old", resolved_at=old))
    db_session.add(AdminAlert(severity="info", source="x", title="open", fingerprint="open"))
    await db_session.commit()
    res = await client.post("/api/v1/internal/alerts/maintenance", headers={"X-Internal-Api-Key": "k"})
    assert res.json()["data"]["purged"] == 1
    assert (await db_session.execute(select(func.count()).select_from(AdminAlert))).scalar_one() == 1
