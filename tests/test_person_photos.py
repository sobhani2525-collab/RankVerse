"""
Person photos/biographies: TMDb credits carry each person's profile_path,
which the sync now stores as attributes["media"] (and fills in for people
created before it did); scripts/backfill_person_profiles.py adds photo +
biography from /person/{id}.

The first group is pure (no database). The DB group needs TEST_DATABASE_URL
like the rest of the suite:
    TEST_DATABASE_URL=... pytest tests/test_person_photos.py
"""
from app.modules.entities.models import Entity
from app.modules.entities.repository import EntityRepository
from app.modules.entities.service import _extract_media
from app.modules.sync.normalizer import (
    TMDB_PROFILE_BASE,
    normalize_movie,
    normalize_tv_series,
    person_attributes,
    person_backfill_attrs,
    person_biography_attrs,
)

NOLAN_PATH = "/xuAIuYSmsUzKlUMBFGVZaWsY3DZ.jpg"


# --- pure ---

def test_person_attributes_writes_the_standard_media_shape():
    attrs = person_attributes(NOLAN_PATH)
    assert attrs == {"profile_path": NOLAN_PATH, "media": {"image_url": f"{TMDB_PROFILE_BASE}{NOLAN_PATH}"}}
    # ...which is what the API's media extraction reads.
    assert _extract_media(attrs).image_url == f"{TMDB_PROFILE_BASE}{NOLAN_PATH}"


def test_person_attributes_is_empty_without_a_photo():
    assert person_attributes(None) == {}
    assert person_attributes("") == {}


def test_movie_credits_keep_profile_path():
    raw = {
        "id": 27205,
        "title": "Inception",
        "release_date": "2010-07-15",
        "credits": {
            "crew": [{"id": 525, "name": "Christopher Nolan", "job": "Director", "profile_path": NOLAN_PATH}],
            "cast": [{"id": 6193, "name": "Leonardo DiCaprio", "character": "Cobb", "order": 0, "profile_path": "/leo.jpg"},
                     {"id": 24045, "name": "No Photo", "character": "X", "order": 1}],
        },
    }
    n = normalize_movie(raw)
    assert n["directors"][0]["profile_path"] == NOLAN_PATH
    assert [c["profile_path"] for c in n["cast"]] == ["/leo.jpg", None]
    # character/order are still there alongside it.
    assert n["cast"][0]["character"] == "Cobb" and n["cast"][0]["order"] == 0


def test_tv_creators_and_directors_keep_profile_path():
    raw = {
        "id": 1396,
        "name": "Breaking Bad",
        "first_air_date": "2008-01-20",
        "number_of_episodes": 62,
        "created_by": [{"id": 66633, "name": "Vince Gilligan", "profile_path": "/vince.jpg"}],
        "aggregate_credits": {"crew": [
            {"id": 29779, "name": "Michelle MacLaren", "profile_path": "/mm.jpg",
             "jobs": [{"job": "Director", "episode_count": 11}]},
        ]},
    }
    n = normalize_tv_series(raw, director_min_episode_ratio=0.1)
    assert n["creators"][0]["profile_path"] == "/vince.jpg"
    assert n["directors"][0]["profile_path"] == "/mm.jpg"


def test_biography_prefers_persian_translation():
    raw = {
        "biography": "British-American filmmaker.",
        "translations": {"translations": [
            {"iso_639_1": "de", "data": {"biography": "Britischer Regisseur."}},
            {"iso_639_1": "fa", "data": {"biography": "  فیلمساز بریتانیایی-آمریکایی.  "}},
        ]},
    }
    assert person_biography_attrs(raw) == {
        "biography": "فیلمساز بریتانیایی-آمریکایی.",
        "biography_en": "British-American filmmaker.",
        "biography_source": "tmdb_fa",
    }


def test_biography_falls_back_to_english_or_nothing():
    only_en = {"biography": "Actor.", "translations": {"translations": [{"iso_639_1": "fa", "data": {"biography": ""}}]}}
    assert person_biography_attrs(only_en)["biography"] == "Actor."
    assert person_biography_attrs(only_en)["biography_source"] == "en"
    assert person_biography_attrs({"biography": ""})["biography_source"] is None


def test_backfill_attrs_drop_missing_values():
    """A person with no photo and no biography must not write nulls over anything."""
    assert person_backfill_attrs({"biography": "", "profile_path": None}) == {}
    attrs = person_backfill_attrs({"biography": "Director.", "profile_path": NOLAN_PATH})
    assert attrs["media"]["image_url"].endswith(NOLAN_PATH)
    assert attrs["biography"] == "Director." and "biography_en" in attrs


# --- database ---

def _person_row(external_id: str, name: str, profile_path: str | None) -> dict:
    return {
        "external_id": external_id,
        "external_source": "tmdb_person",
        "title": name,
        "slug": f"{name.lower().replace(' ', '-')}-{external_id}-photo-test",
        "attributes": person_attributes(profile_path),
    }


async def test_new_people_are_created_with_their_photo(db_session):
    repo = EntityRepository(db_session)
    ids = await repo.get_or_create_many(
        "person", [_person_row("990001", "Photo Person", "/p.jpg")], external_source="tmdb_person", fill_missing_key="media"
    )
    person = await db_session.get(Entity, ids["990001"])
    assert person.attributes["media"]["image_url"] == f"{TMDB_PROFILE_BASE}/p.jpg"


async def test_existing_people_without_a_photo_get_it_filled_in(db_session):
    repo = EntityRepository(db_session)
    # Created the old way: empty attributes.
    ids = await repo.get_or_create_many(
        "person", [{**_person_row("990002", "Old Person", None), "attributes": {}}], external_source="tmdb_person"
    )
    await db_session.commit()

    await repo.get_or_create_many(
        "person", [_person_row("990002", "Old Person", "/old.jpg")], external_source="tmdb_person", fill_missing_key="media"
    )
    await db_session.commit()
    person = await db_session.get(Entity, ids["990002"], populate_existing=True)
    assert person.attributes["media"]["image_url"] == f"{TMDB_PROFILE_BASE}/old.jpg"


async def test_an_existing_photo_is_never_overwritten(db_session):
    repo = EntityRepository(db_session)
    ids = await repo.get_or_create_many(
        "person", [_person_row("990003", "Kept Person", "/first.jpg")], external_source="tmdb_person", fill_missing_key="media"
    )
    await db_session.commit()

    await repo.get_or_create_many(
        "person", [_person_row("990003", "Kept Person", "/second.jpg")], external_source="tmdb_person", fill_missing_key="media"
    )
    await db_session.commit()
    person = await db_session.get(Entity, ids["990003"], populate_existing=True)
    assert person.attributes["media"]["image_url"].endswith("/first.jpg")


async def test_callers_without_fill_key_are_unchanged(db_session):
    """Genres/networks don't pass fill_missing_key: existing rows stay untouched."""
    repo = EntityRepository(db_session)
    ids = await repo.get_or_create_many(
        "genre", [{"title": "Photo Test Genre", "slug": "photo-test-genre", "attributes": {}}], key="slug"
    )
    await db_session.commit()
    await repo.get_or_create_many(
        "genre", [{"title": "Photo Test Genre", "slug": "photo-test-genre", "attributes": {"media": {"image_url": "x"}}}], key="slug"
    )
    await db_session.commit()
    genre = await db_session.get(Entity, ids["photo-test-genre"], populate_existing=True)
    assert genre.attributes == {}
