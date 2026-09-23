"""
Unit tests for the TMDb catalog import's pure helpers: the new overview/
imdb attributes in the normalizer, what a re-sync preserves
(_merge_preserved_attributes), the overview-translation helpers, and IMDb
dataset parsing. No DB or network needed.

Run with: pytest tests/test_catalog_import_helpers.py
"""
import gzip
import uuid

from app.modules.sync.imdb_ratings import load_ratings, rating_above
from app.modules.sync.normalizer import normalize_movie, normalize_tv_series
from app.modules.sync.service import _merge_preserved_attributes
from app.modules.sync.translation import (
    english_source,
    make_custom_id,
    parse_custom_id,
    source_hash,
)

RAW_MOVIE = {
    "id": 550,
    "imdb_id": "tt0137523",
    "original_language": "en",
    "title": "Fight Club",
    "overview": "An insomniac office worker forms an underground fight club.",
    "release_date": "1999-10-15",
    "genres": [],
    "credits": {"cast": [], "crew": []},
}

RAW_TV = {
    "id": 1396,
    "name": "Breaking Bad",
    "original_language": "en",
    "overview": "A high school chemistry teacher turns to manufacturing meth.",
    "first_air_date": "2008-01-20",
    "external_ids": {"imdb_id": "tt0903747"},
    "genres": [],
    "credits": {"cast": [], "crew": []},
}

FA_OVERVIEW = "یک کارمند بی‌خواب یک باشگاه مبارزه زیرزمینی راه می‌اندازد."


def test_normalize_movie_records_imdb_id_and_english_overview():
    attrs = normalize_movie(RAW_MOVIE, {**RAW_MOVIE, "overview": ""})["attributes"]

    assert attrs["imdb_id"] == "tt0137523"
    assert attrs["overview"] == RAW_MOVIE["overview"]
    assert attrs["overview_en"] == RAW_MOVIE["overview"]
    assert attrs["overview_source"] == "en"


def test_normalize_movie_marks_tmdb_persian_overview():
    attrs = normalize_movie(RAW_MOVIE, {**RAW_MOVIE, "overview": FA_OVERVIEW})["attributes"]

    assert attrs["overview"] == FA_OVERVIEW
    assert attrs["overview_en"] == RAW_MOVIE["overview"]
    assert attrs["overview_source"] == "tmdb_fa"


def test_normalize_tv_series_reads_imdb_id_from_external_ids():
    attrs = normalize_tv_series(RAW_TV)["attributes"]

    assert attrs["imdb_id"] == "tt0903747"
    assert attrs["overview_source"] == "en"


def test_normalize_movie_empty_imdb_id_becomes_none():
    attrs = normalize_movie({**RAW_MOVIE, "imdb_id": ""})["attributes"]

    assert attrs["imdb_id"] is None


def _machine_translated(attrs: dict) -> dict:
    return {
        **attrs,
        "overview": FA_OVERVIEW,
        "overview_source": "machine",
        "imdb_rating": 8.8,
        "imdb_votes": 2_300_000,
    }


def test_resync_keeps_machine_translation_and_imdb_rating():
    fresh = normalize_movie(RAW_MOVIE)["attributes"]
    old = _machine_translated(fresh)

    merged = _merge_preserved_attributes(old, fresh)

    assert merged["overview"] == FA_OVERVIEW
    assert merged["overview_source"] == "machine"
    assert merged["imdb_rating"] == 8.8
    assert merged["imdb_votes"] == 2_300_000


def test_resync_drops_machine_translation_when_english_source_changed():
    old = _machine_translated(normalize_movie(RAW_MOVIE)["attributes"])
    fresh = normalize_movie({**RAW_MOVIE, "overview": "A rewritten synopsis."})["attributes"]

    merged = _merge_preserved_attributes(old, fresh)

    assert merged["overview"] == "A rewritten synopsis."
    assert merged["overview_source"] == "en"


def test_resync_prefers_new_tmdb_persian_overview_over_machine_translation():
    old = _machine_translated(normalize_movie(RAW_MOVIE)["attributes"])
    tmdb_fa = "خلاصه فارسی رسمی TMDb."
    fresh = normalize_movie(RAW_MOVIE, {**RAW_MOVIE, "overview": tmdb_fa})["attributes"]

    merged = _merge_preserved_attributes(old, fresh)

    assert merged["overview"] == tmdb_fa
    assert merged["overview_source"] == "tmdb_fa"


def test_resync_drops_imdb_rating_when_imdb_id_changed():
    old = _machine_translated(normalize_movie(RAW_MOVIE)["attributes"])
    fresh = normalize_movie({**RAW_MOVIE, "imdb_id": "tt9999999"})["attributes"]

    merged = _merge_preserved_attributes(old, fresh)

    assert "imdb_rating" not in merged
    assert "imdb_votes" not in merged


def test_english_source_for_legacy_row_without_overview_en():
    # Titles synced before overview_en existed only have `overview`.
    assert english_source({"overview": "English text"}) == "English text"
    assert english_source({"overview": FA_OVERVIEW}) is None
    assert english_source({"overview": None}) is None


def test_english_source_skips_titles_already_in_persian():
    assert english_source({"overview": FA_OVERVIEW, "overview_en": "x", "overview_source": "tmdb_fa"}) is None
    assert english_source({"overview": FA_OVERVIEW, "overview_en": "x", "overview_source": "machine"}) is None
    assert english_source({"overview": "x", "overview_en": "x", "overview_source": "en"}) == "x"


def test_custom_id_round_trips_and_fits_batch_limits():
    entity_id = uuid.uuid4()
    custom_id = make_custom_id(entity_id, "some synopsis")

    assert len(custom_id) <= 64
    assert custom_id.replace("_", "").isalnum()
    assert parse_custom_id(custom_id) == (entity_id, source_hash("some synopsis"))


def test_load_ratings_keeps_only_wanted_titles(tmp_path):
    path = tmp_path / "title.ratings.tsv.gz"
    with gzip.open(path, "wt", encoding="utf-8") as f:
        f.write("tconst\taverageRating\tnumVotes\n")
        f.write("tt0137523\t8.8\t2300000\n")
        f.write("tt0000001\t5.7\t2100\n")

    assert load_ratings(path, {"tt0137523", "tt0903747"}) == {"tt0137523": (8.8, 2_300_000)}


def test_rating_above_uses_imdb_rating_strictly_above_floor():
    accept = rating_above({"tt0137523": (8.8, 2_300_000), "tt0000002": (5.0, 900)}, 5.0)

    assert accept(normalize_movie(RAW_MOVIE)) is True
    # Exactly 5.0 isn't "above 5".
    assert accept(normalize_movie({**RAW_MOVIE, "imdb_id": "tt0000002"})) is False


def test_rating_above_prefers_imdb_over_tmdb_score():
    accept = rating_above({"tt0137523": (4.1, 5000)}, 5.0)

    assert accept(normalize_movie({**RAW_MOVIE, "vote_average": 7.9})) is False


def test_rating_above_falls_back_to_tmdb_score_without_imdb_rating():
    accept = rating_above({}, 5.0)

    assert accept(normalize_movie({**RAW_MOVIE, "vote_average": 6.2})) is True
    assert accept(normalize_movie({**RAW_MOVIE, "imdb_id": None, "vote_average": 4.5})) is False
    assert accept(normalize_movie({**RAW_MOVIE, "imdb_id": None})) is False
