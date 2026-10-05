"""
Tests for the trailer / extended-cast extraction from a TMDb response.
Run with: pytest tests/test_media_extras.py
"""
from app.modules.sync.normalizer import MAX_EXTRA_CAST, media_extras


def _video(key, *, official=False, published="2020-01-01", type_="Trailer", site="YouTube"):
    return {"key": key, "official": official, "published_at": published, "type": type_, "site": site}


def test_prefers_official_then_newest_youtube_trailer():
    raw = {"videos": {"results": [
        _video("old-official", official=True, published="2019-01-01"),
        _video("new-official", official=True, published="2021-01-01"),
        _video("unofficial", official=False, published="2023-01-01"),
        _video("clip", type_="Clip", official=True, published="2024-01-01"),
        _video("vimeo", site="Vimeo", official=True, published="2024-01-01"),
    ]}}
    assert media_extras(raw)["trailer_key"] == "new-official"


def test_no_trailer_key_when_none_qualifies():
    assert "trailer_key" not in media_extras({"videos": {"results": [_video("x", type_="Teaser")]}})
    assert "trailer_key" not in media_extras({})


def test_more_cast_skips_top_five_and_caps_length():
    cast = [{"name": f"Actor {i}", "character": f"Role {i}", "order": i, "profile_path": f"/{i}.jpg"} for i in range(40)]
    more = media_extras({"credits": {"cast": list(reversed(cast))}})["more_cast"]
    assert more[0]["name"] == "Actor 5"
    assert len(more) == MAX_EXTRA_CAST - 5
    assert more[0]["profile_path"] == "/5.jpg"


def test_more_cast_omitted_for_small_cast_and_blank_character_is_none():
    assert "more_cast" not in media_extras({"credits": {"cast": [{"name": "A", "order": 0}] * 5}})
    out = media_extras({"credits": {"cast": [{"name": f"A{i}", "order": i} for i in range(6)]}})
    assert out["more_cast"] == [{"name": "A5", "character": None, "profile_path": None}]
