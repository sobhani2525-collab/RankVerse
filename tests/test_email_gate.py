"""
Posting (comments, public lists) needs a confirmed email -- but only while real
email delivery is configured, so a site without SMTP never locks users out.
Run with: TEST_DATABASE_URL=... pytest tests/test_email_gate.py
"""
import pytest
from datetime import datetime, timezone

from app.config import settings
from app.core.exceptions import ForbiddenError
from app.modules.auth import dependencies as deps
from app.modules.entities.repository import EntityRepository


class _User:
    def __init__(self, verified: bool):
        self.email_verified_at = datetime.now(timezone.utc) if verified else None


def _email_on(monkeypatch, on=True):
    monkeypatch.setattr(deps, "email_enabled", lambda: on)


def test_gate_blocks_unverified_only_when_email_is_configured(monkeypatch):
    _email_on(monkeypatch, True)
    with pytest.raises(ForbiddenError):
        deps.ensure_email_verified(_User(verified=False))
    deps.ensure_email_verified(_User(verified=True))  # confirmed users pass

    _email_on(monkeypatch, False)  # no SMTP: never lock anyone out
    deps.ensure_email_verified(_User(verified=False))


def test_gate_can_be_switched_off_by_setting(monkeypatch):
    _email_on(monkeypatch, True)
    monkeypatch.setattr(settings, "require_verified_email", False)
    deps.ensure_email_verified(_User(verified=False))


async def _movie(db_session):
    entity = await EntityRepository(db_session).create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Gate Movie", slug="gate-movie", attributes={},
    )
    await db_session.commit()
    return entity


async def test_unverified_user_cannot_comment_or_publish_but_can_draft(client, auth_headers, db_session, monkeypatch):
    # test_user is created without email_verified_at => unverified.
    movie = await _movie(db_session)
    _email_on(monkeypatch, True)

    res = await client.post(f"/api/v1/entities/{movie.id}/comments", headers=auth_headers, json={"body": "hi"})
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "forbidden"
    assert "تأیید" in res.json()["error"]["message"]

    # A private draft is allowed; publishing it (or creating public) is not.
    draft = await client.post("/api/v1/lists", headers=auth_headers, json={"title": "My private draft", "visibility": "private"})
    assert draft.status_code == 200
    slug = draft.json()["data"]["slug"]
    assert (await client.post("/api/v1/lists", headers=auth_headers, json={"title": "Public spam list"})).status_code == 403
    assert (await client.put(f"/api/v1/lists/{slug}", headers=auth_headers, json={"visibility": "public"})).status_code == 403
    assert (await client.post(f"/api/v1/lists/{slug}/comments", headers=auth_headers, json={"body": "x"})).status_code == 403


async def test_verified_user_and_no_smtp_are_not_blocked(client, auth_headers, db_session, test_user, monkeypatch):
    movie = await _movie(db_session)

    _email_on(monkeypatch, False)  # no SMTP configured
    assert (await client.post(f"/api/v1/entities/{movie.id}/comments", headers=auth_headers, json={"body": "ok"})).status_code == 200

    _email_on(monkeypatch, True)
    test_user.email_verified_at = datetime.now(timezone.utc)
    await db_session.commit()
    assert (await client.post(f"/api/v1/entities/{movie.id}/comments", headers=auth_headers, json={"body": "ok 2"})).status_code == 200
    assert (await client.post("/api/v1/lists", headers=auth_headers, json={"title": "Public verified list"})).status_code == 200
