"""
Persian overviews for titles TMDb has none for: the machine-translation
versioning (names stay Latin), manual admin overviews that sync and the
translation script never overwrite, and TMDb's non-IR Persian translations.

The first group needs no DB; the admin API tests use the shared fixtures.
Run with: pytest tests/test_manual_overview.py
"""
import uuid

import pytest_asyncio

from app.core.security import create_admin_access_token, hash_password
from app.modules.admin.models import AdminAccount, AdminAuditLog
from app.modules.entities.models import Entity
from app.modules.entities.repository import EntityRepository
from app.modules.sync.normalizer import normalize_movie, translated_overview
from app.modules.sync.service import _merge_preserved_attributes
from app.modules.sync.translation import (
    SYSTEM_PROMPT,
    TRANSLATION_VERSION,
    apply_translation,
    english_source,
    source_hash,
)

EN = "A young man leaves home."
FA = "یک مرد جوان خانه را ترک می‌کند."


# -- english_source: which titles get (re)translated ---------------------------

def test_untranslated_english_overview_needs_translation():
    assert english_source({"overview": EN, "overview_en": EN, "overview_source": "en"}) == EN


def test_tmdb_persian_and_manual_overviews_are_never_translated():
    assert english_source({"overview": FA, "overview_en": EN, "overview_source": "tmdb_fa"}) is None
    assert english_source({"overview": FA, "overview_en": EN, "overview_source": "manual"}) is None


def test_current_machine_translation_is_kept_but_older_ones_are_redone():
    current = {"overview": FA, "overview_en": EN, "overview_source": "machine", "overview_translation_v": TRANSLATION_VERSION}
    legacy = {"overview": FA, "overview_en": EN, "overview_source": "machine"}  # made before versions existed
    assert english_source(current) is None
    assert english_source(legacy) == EN


def test_prompt_keeps_names_in_latin_script():
    assert "Latin script" in SYSTEM_PROMPT
    assert "مایکل" not in SYSTEM_PROMPT


# -- sync merge ----------------------------------------------------------------

def test_sync_keeps_manual_overview_even_when_tmdb_gains_a_persian_one():
    old = {"overview": FA, "overview_en": EN, "overview_source": "manual"}
    new = {"overview": "متن دیگر از TMDb", "overview_en": "Changed.", "overview_source": "tmdb_fa"}
    merged = _merge_preserved_attributes(old, new)
    assert merged["overview"] == FA
    assert merged["overview_source"] == "manual"
    assert merged["overview_en"] == "Changed."


def test_sync_keeps_machine_translation_version():
    old = {"overview": FA, "overview_en": EN, "overview_source": "machine", "overview_translation_v": 2}
    new = {"overview": EN, "overview_en": EN, "overview_source": "en"}
    merged = _merge_preserved_attributes(old, new)
    assert merged["overview"] == FA
    assert merged["overview_translation_v"] == 2


def test_sync_drops_machine_translation_when_english_source_changed():
    old = {"overview": FA, "overview_en": EN, "overview_source": "machine", "overview_translation_v": 2}
    new = {"overview": "New text.", "overview_en": "New text.", "overview_source": "en"}
    merged = _merge_preserved_attributes(old, new)
    assert merged["overview"] == "New text."
    assert merged["overview_source"] == "en"


# -- TMDb translations entry for a non-IR region -------------------------------

RAW_MOVIE = {
    "id": 1,
    "title": "Some Film",
    "overview": EN,
    "release_date": "2001-01-01",
    "genres": [],
    "credits": {"cast": [], "crew": []},
}


def _translations(*entries):
    return {"translations": {"translations": [
        {"iso_639_1": lang, "iso_3166_1": region, "data": {"overview": text}} for lang, region, text in entries
    ]}}


def test_translated_overview_prefers_ir_but_accepts_other_regions():
    assert translated_overview(_translations(("fa", "AF", "متن افغانستان"), ("fa", "IR", FA))) == FA
    assert translated_overview(_translations(("fa", "AF", FA))) == FA
    assert translated_overview(_translations(("fa", "IR", "  "), ("de", "DE", "Text"))) is None
    assert translated_overview({}) is None


def test_normalize_movie_uses_non_ir_persian_translation_when_fa_ir_is_empty():
    raw = {**RAW_MOVIE, **_translations(("fa", "AF", FA))}
    attrs = normalize_movie(raw, {**RAW_MOVIE, "overview": ""})["attributes"]
    assert attrs["overview"] == FA
    assert attrs["overview_source"] == "tmdb_fa"
    assert attrs["overview_en"] == EN


# -- apply_translation + admin API ---------------------------------------------

async def _movie(db, **attrs):
    return await EntityRepository(db).create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title="Some Film", slug=f"some-film-{uuid.uuid4().hex[:6]}", attributes=attrs,
    )


async def test_apply_translation_stamps_version_and_skips_manual(db_session):
    untranslated = await _movie(db_session, overview=EN, overview_en=EN, overview_source="en")
    manual = await _movie(db_session, overview=FA, overview_en=EN, overview_source="manual")
    await db_session.commit()

    assert await apply_translation(db_session, untranslated.id, source_hash(EN), FA) is True
    assert await apply_translation(db_session, manual.id, source_hash(EN), "ترجمه ماشینی") is False
    await db_session.commit()
    await db_session.refresh(untranslated)
    await db_session.refresh(manual)

    assert untranslated.attributes["overview_source"] == "machine"
    assert untranslated.attributes["overview_translation_v"] == TRANSLATION_VERSION
    assert manual.attributes["overview"] == FA


@pytest_asyncio.fixture
async def admin_headers(db_session):
    admin = AdminAccount(email="admin@example.com", password_hash=hash_password("Sup3rSecret!1234"))
    db_session.add(admin)
    await db_session.commit()
    return {"Authorization": f"Bearer {create_admin_access_token(str(admin.id))}"}


async def test_admin_overview_endpoints_require_admin(client, db_session):
    movie = await _movie(db_session, overview=EN, overview_en=EN, overview_source="en")
    await db_session.commit()
    assert (await client.get("/api/v1/admin/entities")).status_code in (401, 403)
    assert (await client.put(f"/api/v1/admin/entities/{movie.id}/overview", json={"overview": FA})).status_code in (401, 403)


async def test_admin_sets_and_resets_manual_overview(client, db_session, admin_headers):
    movie = await _movie(db_session, overview=EN, overview_en=EN, overview_source="en", external_vote_count=50)
    await db_session.commit()

    res = await client.put(f"/api/v1/admin/entities/{movie.id}/overview", json={"overview": f"  {FA}  "}, headers=admin_headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["overview"] == FA and data["overview_source"] == "manual" and data["overview_en"] == EN

    listed = await client.get("/api/v1/admin/entities?source=manual", headers=admin_headers)
    assert [r["id"] for r in listed.json()["data"]] == [str(movie.id)]
    assert listed.json()["meta"]["total"] == 1

    res = await client.delete(f"/api/v1/admin/entities/{movie.id}/overview", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["overview"] == EN and data["overview_source"] == "en"

    actions = [a.action for a in (await db_session.execute(AdminAuditLog.__table__.select())).all()]
    assert sorted(actions) == ["entity.overview.reset", "entity.overview.set"]


async def test_admin_rejects_non_persian_overview_and_non_manual_reset(client, db_session, admin_headers):
    movie = await _movie(db_session, overview=EN, overview_en=EN, overview_source="en")
    await db_session.commit()

    res = await client.put(f"/api/v1/admin/entities/{movie.id}/overview", json={"overview": "English only"}, headers=admin_headers)
    assert res.status_code == 400
    res = await client.delete(f"/api/v1/admin/entities/{movie.id}/overview", headers=admin_headers)
    assert res.status_code == 400


async def test_admin_overview_404_for_unknown_or_non_title_entity(client, db_session, admin_headers):
    person = await EntityRepository(db_session).create_entity(
        entity_type="person", external_id=None, external_source=None, title="P", slug="p-1", attributes={},
    )
    await db_session.commit()
    for entity_id in (uuid.uuid4(), person.id):
        res = await client.put(f"/api/v1/admin/entities/{entity_id}/overview", json={"overview": FA}, headers=admin_headers)
        assert res.status_code == 404


# -- obscure Asian-language titles are not machine-translated -------------------

def test_obscure_asian_language_titles_are_low_priority_but_popular_ones_are_not():
    from app.modules.sync.translation import is_low_priority

    assert is_low_priority({"original_language": "zh", "external_vote_count": 40})
    assert is_low_priority({"original_language": "ko"})  # no votes recorded
    assert is_low_priority({"original_language": "ar", "external_vote_count": 10})
    assert is_low_priority({"original_language": "tr", "external_vote_count": 10})
    assert not is_low_priority({"original_language": "ko", "external_vote_count": 17000})
    assert not is_low_priority({"original_language": "en", "external_vote_count": 3})
    assert not is_low_priority({})


# -- Aparat trailers -------------------------------------------------------------

def test_parse_aparat_hash_accepts_links_embeds_and_bare_hashes():
    from app.modules.admin.entities_service import parse_aparat_hash

    assert parse_aparat_hash("https://www.aparat.com/v/abC12") == "abC12"
    assert parse_aparat_hash("aparat.com/v/x9Yz8/some-title?ref=1") == "x9Yz8"
    assert parse_aparat_hash(
        '<iframe src="https://www.aparat.com/video/video/embed/videohash/Qw7e3/vt/frame" allowFullScreen></iframe>'
    ) == "Qw7e3"
    assert parse_aparat_hash('<script src="https://www.aparat.com/embed/Rt5y6?data[rnddiv]=1"></script>') == "Rt5y6"
    assert parse_aparat_hash("  k8L2m  ") == "k8L2m"
    assert parse_aparat_hash("https://www.youtube.com/watch?v=abc123") is None
    assert parse_aparat_hash("not a link") is None


def test_sync_keeps_aparat_trailer():
    merged = _merge_preserved_attributes({"aparat_trailer": "abC12", "trailer_key": "old"}, {"trailer_key": "new"})
    assert merged == {"aparat_trailer": "abC12", "trailer_key": "new"}


async def test_admin_sets_and_removes_aparat_trailer(client, db_session, admin_headers):
    movie = await _movie(db_session, title_fa="فیلم ایرانی")
    other = await _movie(db_session, trailer_key="yt")
    await db_session.commit()

    res = await client.put(f"/api/v1/admin/entities/{movie.id}/trailer", json={"url": "youtube.com/x"}, headers=admin_headers)
    assert res.status_code == 400

    listed = await client.get("/api/v1/admin/entities?trailer=none", headers=admin_headers)
    assert [r["id"] for r in listed.json()["data"]] == [str(movie.id)]

    res = await client.put(
        f"/api/v1/admin/entities/{movie.id}/trailer", json={"url": "https://www.aparat.com/v/abC12"}, headers=admin_headers
    )
    assert res.status_code == 200 and res.json()["data"]["aparat_trailer"] == "abC12"

    listed = await client.get("/api/v1/admin/entities?trailer=aparat&q=ایرانی", headers=admin_headers)
    assert [r["id"] for r in listed.json()["data"]] == [str(movie.id)]

    detail = await client.get(f"/api/v1/movies/{movie.slug}")
    assert detail.json()["data"]["aparat_trailer"] == "abC12"

    res = await client.delete(f"/api/v1/admin/entities/{movie.id}/trailer", headers=admin_headers)
    assert res.status_code == 200 and res.json()["data"]["aparat_trailer"] is None
    assert (await client.delete(f"/api/v1/admin/entities/{other.id}/trailer", headers=admin_headers)).status_code == 400

    actions = [a.action for a in (await db_session.execute(AdminAuditLog.__table__.select())).all()]
    assert sorted(actions) == ["entity.trailer.remove", "entity.trailer.set"]
