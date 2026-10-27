"""Wording and timing helpers of the daily auto list (no database needed)."""
import random
from datetime import date, datetime, timezone

from app.modules.auto_lists.service import tehran_day_start
from app.modules.auto_lists.texts import (
    GENRE_FA, fa_number, publish_hour, render_actor_list, render_decade_list,
)


def test_publish_hour_is_daytime_and_varies():
    hours = {publish_hour(date(2026, 11, d)) for d in range(1, 29)}
    assert hours <= set(range(9, 21))
    assert len(hours) > 3


def test_same_day_renders_same_text():
    a = render_actor_list(random.Random("2026-11-01:0"), "آل پاچینو", "جنایی", 8)
    b = render_actor_list(random.Random("2026-11-01:0"), "آل پاچینو", "جنایی", 8)
    assert a == b


def test_texts_contain_real_values_and_no_placeholders():
    for seed in range(30):
        title, desc = render_actor_list(random.Random(seed), "آل پاچینو", "جنایی", 8)
        assert "آل پاچینو" in title or "آل پاچینو" in desc
        title, desc = render_decade_list(random.Random(seed), 1990, "درام", 9)
        assert "۱۹۹۰" in title or "۱۹۹۰" in desc
        for text in (title, desc):
            assert "{" not in text and "}" not in text


def test_fa_number():
    assert fa_number(1990) == "۱۹۹۰"


def test_all_genres_have_persian_names():
    assert all(v for v in GENRE_FA.values())


def test_tehran_day_start_is_previous_day_2030_utc():
    start = tehran_day_start(date(2026, 10, 28))
    assert start == datetime(2026, 10, 27, 20, 30, tzinfo=timezone.utc)
