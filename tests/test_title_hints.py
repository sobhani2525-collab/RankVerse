"""Unit tests for list-title hints (app/modules/lists/title_hints.py). Pure, no DB."""
from app.modules.lists.title_hints import parse_title_hints


def test_director_name():
    h = parse_title_hints("برترین فیلم‌های تیم برتون")
    assert "تیم برتون" in h.phrases and not h.genres and h.decade is None


def test_genre_and_decade():
    h = parse_title_hints("بهترین های موزیکال در دهه 1990")
    assert h.genres == {"music"} and h.decade == 1990


def test_persian_digits_and_short_decade():
    assert parse_title_hints("کمدی‌های دهه ۸۰").decade == 1980
    assert parse_title_hints("بهترین فیلم‌های دهه نود").decade == 1990


def test_surname_only():
    assert "نولان" in parse_title_hints("فیلم‌های نولان").phrases
