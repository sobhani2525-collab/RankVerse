"""Wording and timing helpers of the daily auto list (no database needed)."""
import random
from datetime import date, datetime, timezone

from app.config import settings
from app.modules.auto_lists.battles import pick_size
from app.modules.auto_lists.themes import Theme
from app.modules.auto_lists.service import configured_emails, tehran_day_start
from app.modules.auto_lists.texts import (
    GENRE_FA, fa_number, publish_hour, render_actor_battle, render_actor_list,
    render_battle, render_decade_battle, render_decade_list, render_list,
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


def _theme(kind, work, **kw):
    base = dict(
        kind=kind, work=work, key="k", genre_fa="جنایی", person_fa=None, decade=None, role=None,
        origin=None, tags=[], items=[object()] * 8,
    )
    base.update(kw)
    return Theme(**base)


def test_wording_for_every_kind_is_clean_and_names_the_right_thing():
    themes = [
        _theme("actor", "tv_series", person_fa="آل پاچینو"),
        _theme("actor", "mixed", person_fa="آل پاچینو"),
        _theme("decade", "tv_series", decade=1990),
        _theme("decade", "mixed", decade=1990),
        _theme("people", "person", role="actor"),
        _theme("people", "person", role="director"),
        _theme("people", "person", role="creator"),
        *[_theme("people", "person", genre_fa=None, role=r, origin=o)
          for r in ("actor", "director") for o in ("persian", "foreign")],
    ]
    for theme in themes:
        for seed in range(40):
            title, desc = render_list(random.Random(seed), theme)
            assert title and desc
            for text in (title, desc):
                assert "{" not in text and "}" not in text
    for seed in range(40):
        title, _ = render_list(random.Random(seed), _theme("actor", "tv_series", person_fa="آل پاچینو"))
        assert "سریال" in title
        title, _ = render_list(random.Random(seed), _theme("actor", "mixed", person_fa="آل پاچینو"))
        assert "سریال" in title and "فیلم" in title


def test_battle_wording_names_series_and_fits_the_title_limit():
    for seed in range(60):
        for theme in (_theme("actor", "tv_series", person_fa="محمدرضا گلزار", genre_fa="علمی‌تخیلی"),
                      _theme("decade", "tv_series", decade=1990, genre_fa="علمی‌تخیلی")):
            title, desc = render_battle(random.Random(seed), theme, 16)
            assert 3 <= len(title) <= 100
            assert "سریال" in title + desc
            assert "{" not in title + desc
        title, _ = render_battle(random.Random(seed), _theme("decade", "movie", decade=1990), 8)
        assert "سریال" not in title
