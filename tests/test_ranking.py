"""
Unit tests for the Bayesian ranking formula (no DB required for the pure-math part).
Run with: pytest tests/test_ranking.py
"""
from app.modules.ranking.service import RankingService


class FakeSettings:
    ranking_min_votes = 50
    ranking_user_weight = 0.7
    ranking_external_weight = 0.3


def make_service():
    svc = RankingService.__new__(RankingService)  # bypass __init__ (no db needed)
    svc.m = FakeSettings.ranking_min_votes
    svc.alpha = FakeSettings.ranking_user_weight
    svc.beta = FakeSettings.ranking_external_weight
    return svc


def test_low_votes_pulled_toward_platform_average():
    svc = make_service()
    # 2 votes of 5/5 (1-5 scale), platform average is 3.0 -> should be pulled far below 5
    score = svc.bayesian_score(v=2, R=5.0, C=3.0)
    assert 3.0 < score < 3.5


def test_high_votes_close_to_real_average():
    svc = make_service()
    # 5000 votes averaging 4.5/5, platform average 3.0 -> should stay close to 4.5
    score = svc.bayesian_score(v=5000, R=4.5, C=3.0)
    assert score > 4.4


def test_no_votes_falls_back_to_platform_average():
    svc = make_service()
    score = svc.bayesian_score(v=0, R=None, C=3.0)
    assert score == 3.0


def test_blend_with_external_score():
    svc = make_service()
    # external_0_10 stays on the TMDb 0-10 scale -- only the user-facing
    # UserRating.score moved to 1-5, the external blend input is untouched.
    final = svc.blend_with_external(bayesian=4.0, external_0_10=7.0, C=3.0)
    # 0.7*4 + 0.3*7 = 4.9
    assert final == 4.9
