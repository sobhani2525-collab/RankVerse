"""
Contact form: public submissions (guest and signed in, honeypot, validation) and
the admin inbox (filters, new count, review with audit log).

Needs Postgres: TEST_DATABASE_URL=... pytest tests/test_contact.py
"""
import pytest_asyncio
from sqlalchemy import select

from app.core.security import create_admin_access_token, hash_password
from app.modules.admin.models import AdminAccount, AdminAuditLog
from app.modules.contact.models import ContactMessage

URL = "/api/v1/contact"
ADMIN_URL = "/api/v1/admin/contact-messages"

BODY = {"category": "bug", "subject": "صفحه باز نمی‌شود", "message": "صفحهٔ فیلم با خطا روبه‌رو می‌شود و چیزی نشان نمی‌دهد."}


@pytest_asyncio.fixture
async def admin_headers(db_session):
    admin = AdminAccount(email="contact-admin@example.com", password_hash=hash_password("Sup3rSecret!1234"))
    db_session.add(admin)
    await db_session.commit()
    return {"Authorization": f"Bearer {create_admin_access_token(str(admin.id))}"}


async def test_guest_message_is_stored(client, db_session):
    r = await client.post(URL, json={**BODY, "email": "guest@example.com", "page_url": "/movies/x"})
    assert r.status_code == 201, r.text
    m = (await db_session.execute(select(ContactMessage))).scalar_one()
    assert (m.category, m.email, m.page_url, m.status, m.user_id) == ("bug", "guest@example.com", "/movies/x", "new", None)


async def test_signed_in_message_links_the_user(client, db_session, auth_headers):
    r = await client.post(URL, json={**BODY, "email": ""}, headers=auth_headers)
    assert r.status_code == 201, r.text
    m = (await db_session.execute(select(ContactMessage))).scalar_one()
    assert m.user_id is not None and m.email  # falls back to the account's email


async def test_honeypot_is_accepted_but_dropped(client, db_session):
    r = await client.post(URL, json={**BODY, "website": "http://spam.example"})
    assert r.status_code == 201
    assert (await db_session.execute(select(ContactMessage))).first() is None


async def test_invalid_payloads_are_rejected(client):
    assert (await client.post(URL, json={**BODY, "category": "nope"})).status_code == 422
    assert (await client.post(URL, json={**BODY, "message": "   کوتاه   "})).status_code == 422
    assert (await client.post(URL, json={**BODY, "email": "not-an-email"})).status_code == 422


async def test_page_url_is_free_text_with_bare_domains_fixed(client, db_session):
    assert (await client.post(URL, json={**BODY, "page_url": "cinemagozin.ir/movies/x", "email": " a@b.co "})).status_code == 201
    assert (await client.post(URL, json={**BODY, "page_url": "صفحهٔ فیلم پدرخوانده"})).status_code == 201
    rows = (await db_session.execute(select(ContactMessage).order_by(ContactMessage.created_at))).scalars().all()
    assert sorted(m.page_url for m in rows) == sorted(["https://cinemagozin.ir/movies/x", "صفحهٔ فیلم پدرخوانده"])
    assert any(m.email == "a@b.co" for m in rows)


async def test_admin_inbox_needs_an_admin(client, auth_headers):
    assert (await client.get(ADMIN_URL)).status_code == 401
    assert (await client.get(ADMIN_URL, headers=auth_headers)).status_code in (401, 403)


async def test_admin_lists_filters_and_reviews(client, db_session, admin_headers):
    await client.post(URL, json=BODY)
    await client.post(URL, json={**BODY, "category": "inappropriate", "page_url": "/lists/bad"})

    r = await client.get(ADMIN_URL, headers=admin_headers)
    assert r.status_code == 200 and r.json()["meta"]["total"] == 2
    r = await client.get(ADMIN_URL, params={"category": "inappropriate"}, headers=admin_headers)
    rows = r.json()["data"]
    assert [x["page_url"] for x in rows] == ["/lists/bad"]
    assert (await client.get(f"{ADMIN_URL}/new-count", headers=admin_headers)).json()["data"]["count"] == 2

    r = await client.patch(f"{ADMIN_URL}/{rows[0]['id']}", json={"status": "reviewed", "admin_note": " حذف شد "}, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert (r.json()["data"]["status"], r.json()["data"]["admin_note"]) == ("reviewed", "حذف شد")
    assert r.json()["data"]["reviewed_at"]
    assert (await client.get(f"{ADMIN_URL}/new-count", headers=admin_headers)).json()["data"]["count"] == 1
    assert (await client.get(ADMIN_URL, params={"status": "reviewed"}, headers=admin_headers)).json()["meta"]["total"] == 1

    log = (await db_session.execute(select(AdminAuditLog).where(AdminAuditLog.action == "contact.update"))).scalar_one()
    assert log.after == {"status": "reviewed", "admin_note": "حذف شد"}
