"""
Persian list slugs, slug history (old URLs keep resolving) and the sitemap
feed. Run with: pytest tests/test_list_slugs.py
"""
from urllib.parse import quote

import pytest

from app.core.slug import persian_slugify


@pytest.mark.parametrize(
    "title, expected",
    [
        ("بهترین فیلم‌های نولان", "بهترین-فیلم-های-نولان"),
        ("فيلم هاي كلاسيك", "فیلم-های-کلاسیک"),
        ("۱۰ فیلم برتر دهه‌ی ۹۰", "10-فیلم-برتر-دهه-ی-90"),
        ("کِتابِ «جنگ و صلح»؛ اقتباس‌ها؟", "کتاب-جنگ-و-صلح-اقتباس-ها"),
        ("Top 10 Marvel فیلم", "top-10-marvel-فیلم"),
        ("مسئله", "مسئله"),  # ئ is deliberately not folded
        ("!!!", "list"),
        ("", "list"),
    ],
)
def test_persian_slugify(title, expected):
    assert persian_slugify(title) == expected


def test_persian_slugify_trims_long_titles_at_a_word_boundary():
    title = " ".join(["فیلم"] * 40)
    slug = persian_slugify(title, max_length=80)
    assert len(slug) <= 80
    assert slug.startswith("فیلم-") and not slug.endswith("-")
    assert set(slug.split("-")) == {"فیلم"}  # no half-cut word


def test_persian_slugify_hard_cuts_when_no_late_separator():
    assert persian_slugify("ا" * 100, max_length=80) == "ا" * 80


async def _create(client, headers, title, **extra):
    res = await client.post("/api/v1/lists", headers=headers, json={"title": title, **extra})
    assert res.status_code == 200
    return res.json()["data"]["slug"]


async def _rename(client, headers, slug, title):
    res = await client.put(f"/api/v1/lists/{quote(slug)}", headers=headers, json={"title": title})
    assert res.status_code == 200, res.text
    return res


async def _movie(db_session, title):
    from app.modules.entities.repository import EntityRepository

    return await EntityRepository(db_session).create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title=title, slug=title.lower().replace(" ", "-"), attributes={},
    )


async def test_persian_title_gets_persian_slug_reachable_percent_encoded(client, auth_headers):
    slug = await _create(client, auth_headers, "بهترین فیلم‌های نولان")
    assert slug == "بهترین-فیلم-های-نولان"

    res = await client.get(f"/api/v1/lists/{quote(slug)}")
    assert res.status_code == 200
    assert res.json()["data"]["slug"] == slug


async def test_colliding_normalized_titles_get_a_numeric_suffix(client, auth_headers):
    first = await _create(client, auth_headers, "فیلم‌های کلاسیک")
    second = await _create(client, auth_headers, "فيلم هاي كلاسيك")
    assert first == "فیلم-های-کلاسیک"
    assert second == "فیلم-های-کلاسیک-2"


async def test_reserved_slug_is_never_used(client, auth_headers):
    assert await _create(client, auth_headers, "New") == "new-2"


async def test_rename_moves_slug_and_old_slug_keeps_working(client, auth_headers):
    old = await _create(client, auth_headers, "لیست قدیمی")
    res = await _rename(client, auth_headers, old, "لیست جدید")
    new = "لیست-جدید"

    detail = await client.get(f"/api/v1/lists/{quote(old)}", headers=auth_headers)
    assert detail.status_code == 200
    assert detail.json()["data"]["slug"] == new

    liked = await client.post(f"/api/v1/lists/{quote(old)}/like", headers=auth_headers)
    assert liked.status_code == 200
    assert liked.json()["data"]["liked"] is True

    # The old slug is reserved for redirecting: a fresh list can't take it.
    assert await _create(client, auth_headers, "لیست قدیمی") == "لیست-قدیمی-2"


async def test_renaming_back_reclaims_the_lists_own_old_slug(client, auth_headers):
    original = await _create(client, auth_headers, "نام اول")
    await _rename(client, auth_headers, original, "نام دوم")
    res = await _rename(client, auth_headers, "نام-دوم", "نام اول")

    detail = await client.get(f"/api/v1/lists/{quote(original)}")
    assert detail.json()["data"]["slug"] == original
    # and the intermediate slug now redirects to it
    via_second = await client.get(f"/api/v1/lists/{quote('نام-دوم')}")
    assert via_second.json()["data"]["slug"] == original


async def test_editing_only_the_description_keeps_the_slug(client, auth_headers):
    slug = await _create(client, auth_headers, "ثابت بمان")
    res = await client.put(
        f"/api/v1/lists/{quote(slug)}", headers=auth_headers, json={"description": "توضیح تازه"}
    )
    assert res.status_code == 200
    assert (await client.get(f"/api/v1/lists/{quote(slug)}")).json()["data"]["slug"] == slug


async def test_sitemap_lists_only_public_non_empty_lists(client, auth_headers, db_session):
    with_items = await _create(client, auth_headers, "لیست پر")
    empty = await _create(client, auth_headers, "لیست خالی")
    movie = await _movie(db_session, "Sitemap Movie")
    added = await client.post(
        f"/api/v1/lists/{quote(with_items)}/items", headers=auth_headers,
        json={"entity_id": str(movie.id)},
    )
    assert added.status_code == 200

    # Creates the private «تماشا-خواهم-کرد» list, which has an item too.
    toggled = await client.post(
        "/api/v1/users/me/watch-later/toggle", headers=auth_headers,
        json={"entity_id": str(movie.id)},
    )
    assert toggled.status_code == 200

    res = await client.get("/api/v1/sitemap/lists")
    assert res.status_code == 200
    entries = res.json()["data"]
    slugs = {e["slug"] for e in entries}
    assert with_items in slugs
    assert empty not in slugs
    assert "تماشا-خواهم-کرد" not in slugs
    assert all(e["updated_at"] for e in entries)
