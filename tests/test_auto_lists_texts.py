"""Wording and timing helpers of the daily auto list (no database needed)."""
import random
from datetime import date, datetime, timezone

from app.config import settings
from app.modules.auto_lists.battles import pick_size
from app.modules.auto_lists.service import configured_emails, tehran_day_start
from app.modules.auto_lists.texts import (
    GENRE_FA, fa_number, publish_hour, render_actor_battle, render_actor_list,
    render_decade_battle, render_decade_list,
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


def test_slot_zero_hour_unchanged_and_slots_differ():
    day = date(2026, 11, 3)
    assert publish_hour(day) == publish_hour(day, 0)
    assert len({publish_hour(day, k) for k in range(3)}) == 3
    assert all(9 <= publish_hour(day, k) <= 20 for k in range(3))


def test_battle_texts_fit_title_limit_and_have_no_placeholders():
    for seed in range(60):
        for title, desc in (
            render_actor_battle(random.Random(seed), "محمدرضا گلزار", "علمی‌تخیلی", 16),
            render_decade_battle(random.Random(seed), 1990, "علمی‌تخیلی", 16),
        ):
            assert 3 <= len(title) <= 100
            for text in (title, desc):
                assert "{" not in text and "}" not in text


def test_pick_size_only_fits_available_movies():
    rng = random.Random(1)
    assert pick_size(rng, 3) is None
    assert {pick_size(random.Random(i), 5) for i in range(30)} == {4}
    assert {pick_size(random.Random(i), 40) for i in range(60)} == {4, 8, 16}


def test_configured_emails_dedupes_and_falls_back(monkeypatch):
    monkeypatch.setattr(settings, "auto_lists_user_emails", " A@x.com, b@x.com ,a@x.com,,")
    assert configured_emails() == ["a@x.com", "b@x.com"]
    monkeypatch.setattr(settings, "auto_lists_user_emails", "")
    monkeypatch.setattr(settings, "auto_lists_user_email", "Site@x.com")
    assert configured_emails() == ["site@x.com"]
