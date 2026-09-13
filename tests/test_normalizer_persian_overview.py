"""
Unit tests for the Persian-overview and Persian-title fallback in
normalize_movie/normalize_tv_series (see SyncService.sync_movie/sync_tv_series,
which fetch a second TMDb response with language=fa-IR just for these). No
DB or network needed.

Run with: pytest tests/test_normalizer_persian_overview.py
"""
from app.modules.sync.normalizer import _persian_title, normalize_movie, normalize_tv_series

RAW_MOVIE = {
    "id": 238,
    "title": "The Godfather",
    "overview": "The aging patriarch of an organized crime dynasty transfers control to his reluctant son.",
    "release_date": "1972-03-14",
    "genres": [],
    "credits": {"cast": [], "crew": []},
}

RAW_TV = {
    "id": 1396,
    "name": "Breaking Bad",
    "overview": "A high school chemistry teacher turns to manufacturing meth.",
    "first_air_date": "2008-01-20",
    "genres": [],
    "credits": {"cast": [], "crew": []},
}


def test_normalize_movie_uses_persian_overview_when_available():
    raw_fa = {**RAW_MOVIE, "overview": "پدرسالار در حال پیر شدن یک خاندان جنایتکار، کنترل را به پسر بی‌میلش می‌سپارد."}

    normalized = normalize_movie(RAW_MOVIE, raw_fa)

    assert normalized["attributes"]["overview"] == raw_fa["overview"]


def test_normalize_movie_falls_back_to_english_when_no_persian_translation():
    # TMDb returns an empty string (not the English text) for a title with
    # no fa-IR translation -- must fall back to the English overview, not
    # store the empty string.
    raw_fa = {**RAW_MOVIE, "overview": ""}

    normalized = normalize_movie(RAW_MOVIE, raw_fa)

    assert normalized["attributes"]["overview"] == RAW_MOVIE["overview"]


def test_normalize_movie_falls_back_to_english_when_fa_fetch_failed():
    # SyncService passes raw_fa=None when the fa-IR request itself failed.
    normalized = normalize_movie(RAW_MOVIE, None)

    assert normalized["attributes"]["overview"] == RAW_MOVIE["overview"]


def test_normalize_tv_series_uses_persian_overview_when_available():
    raw_fa = {**RAW_TV, "overview": "یک دبیر شیمی دبیرستان به تولید متامفتامین روی می‌آورد."}

    normalized = normalize_tv_series(RAW_TV, raw_fa)

    assert normalized["attributes"]["overview"] == raw_fa["overview"]


def test_normalize_tv_series_falls_back_to_english_when_no_persian_translation():
    raw_fa = {**RAW_TV, "overview": ""}

    normalized = normalize_tv_series(RAW_TV, raw_fa)

    assert normalized["attributes"]["overview"] == RAW_TV["overview"]


# --- title_fa (used for the "PersianTitle (EnglishTitle)" display format) ---


def test_persian_title_returns_translation_when_it_differs_from_english():
    assert _persian_title("پدرخوانده", "The Godfather") == "پدرخوانده"


def test_persian_title_is_none_when_tmdb_has_no_translation():
    # Unlike overview, TMDb's title/name field is never empty -- when there's
    # no fa-IR translation it just echoes back the same value the default-
    # language request got. That's the signal treated as "no translation".
    assert _persian_title("The Godfather", "The Godfather") is None


def test_persian_title_is_none_when_missing_or_empty():
    assert _persian_title(None, "The Godfather") is None
    assert _persian_title("", "The Godfather") is None


def test_normalize_movie_sets_title_fa_when_translation_available():
    raw_fa = {**RAW_MOVIE, "title": "پدرخوانده"}

    normalized = normalize_movie(RAW_MOVIE, raw_fa)

    assert normalized["attributes"]["title_fa"] == "پدرخوانده"


def test_normalize_movie_title_fa_is_none_without_translation():
    normalized = normalize_movie(RAW_MOVIE, {**RAW_MOVIE})  # raw_fa echoes the English title back

    assert normalized["attributes"]["title_fa"] is None


def test_normalize_tv_series_sets_title_fa_when_translation_available():
    raw_fa = {**RAW_TV, "name": "برکینگ بد"}

    normalized = normalize_tv_series(RAW_TV, raw_fa)

    assert normalized["attributes"]["title_fa"] == "برکینگ بد"


def test_normalize_tv_series_title_fa_is_none_without_translation():
    normalized = normalize_tv_series(RAW_TV, {**RAW_TV})

    assert normalized["attributes"]["title_fa"] is None
