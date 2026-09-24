"""
Unit tests for select_tv_directors (normalize_tv_series' director pick from
TMDb aggregate_credits, see SyncService._sync_tv_credits). Episode counts
are taken from real TMDb responses for Breaking Bad (1396) and Noon Khe
(101827). No DB or network needed.

Run with: pytest tests/test_tv_directors.py
"""
from app.modules.sync.normalizer import normalize_tv_series, select_tv_directors


def _crew(person_id: int, name: str, *jobs: tuple[str, int]) -> dict:
    return {
        "id": person_id,
        "name": name,
        "jobs": [{"job": job, "episode_count": n} for job, n in jobs],
        "total_episode_count": sum(n for _, n in jobs),
    }


BREAKING_BAD = {
    "id": 1396,
    "name": "Breaking Bad",
    "number_of_episodes": 62,
    "credits": {"cast": [], "crew": []},
    "aggregate_credits": {
        "crew": [
            _crew(29779, "Michelle MacLaren", ("Director", 11)),
            _crew(111338, "Adam Bernstein", ("Director", 8)),
            # total_episode_count is 67 here because of his writing credits --
            # only the Director job's own episode_count should count.
            _crew(66633, "Vince Gilligan", ("Director", 5), ("Writer", 62)),
            _crew(21377, "Peter Medak", ("Director", 1)),
            _crew(1280071, "Some Editor", ("Editor", 30)),
        ]
    },
}


def test_keeps_directors_at_or_above_ratio():
    raw = {
        "number_of_episodes": 10,
        "aggregate_credits": {"crew": [
            _crew(1, "A", ("Director", 5)),
            _crew(2, "B", ("Director", 2)),
            _crew(3, "C", ("Director", 1)),
        ]},
    }
    assert [d["name"] for d in select_tv_directors(raw, 0.2)] == ["A", "B"]


def test_uses_director_job_episode_count_not_total():
    directors = select_tv_directors(BREAKING_BAD, 0.08)
    gilligan = next(d for d in directors if d["name"] == "Vince Gilligan")
    assert gilligan["episode_count"] == 5


def test_falls_back_to_top_director_when_nobody_reaches_ratio():
    # Nobody on Breaking Bad directed 20% of its 62 episodes (MacLaren: 11 = 18%).
    directors = select_tv_directors(BREAKING_BAD, 0.2)
    assert directors == [{"external_id": "29779", "name": "Michelle MacLaren", "profile_path": None, "episode_count": 11}]


def test_non_director_jobs_are_ignored():
    names = {d["name"] for d in select_tv_directors(BREAKING_BAD, 0.0)}
    assert "Some Editor" not in names


def test_single_series_director_is_kept():
    raw = {
        "number_of_episodes": 90,
        "aggregate_credits": {"crew": [_crew(1530758, "Saeed Aghakhani", ("Director", 90))]},
    }
    assert select_tv_directors(raw, 0.2) == [
        {"external_id": "1530758", "name": "Saeed Aghakhani", "profile_path": None, "episode_count": 90}
    ]


def test_falls_back_to_plain_credits_without_aggregate_directors():
    raw = {
        "number_of_episodes": 90,
        "credits": {"crew": [{"id": 1530758, "name": "Saeed Aghakhani", "job": "Director"}]},
    }
    assert select_tv_directors(raw, 0.2) == [
        {"external_id": "1530758", "name": "Saeed Aghakhani", "profile_path": None, "episode_count": None}
    ]


def test_normalize_tv_series_passes_ratio_through():
    raw = {**BREAKING_BAD, "genres": [], "created_by": [{"id": 66633, "name": "Vince Gilligan"}]}
    normalized = normalize_tv_series(raw, director_min_episode_ratio=0.1)
    assert [d["name"] for d in normalized["directors"]] == ["Michelle MacLaren", "Adam Bernstein"]
    assert normalized["creators"] == [{"external_id": "66633", "name": "Vince Gilligan", "profile_path": None}]
