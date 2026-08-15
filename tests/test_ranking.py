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
    # 2 votes of 10/10, platform average is 6.0 -> should be pulled far below 10
    score = svc.bayesian_score(v=2, R=10.0, C=6.0)
    assert 6.0 < score < 7.0


def test_high_votes_close_to_real_average():
    svc = make_service()
    # 5000 votes averaging 9/10, platform average 6.0 -> should stay close to 9
    score = svc.bayesian_score(v=5000, R=9.0, C=6.0)
    assert score > 8.9


def test_no_votes_falls_back_to_platform_average():
    svc = make_service()
    score = svc.bayesian_score(v=0, R=None, C=6.0)
    assert score == 6.0


def test_blend_with_external_score():
    svc = make_service()
    final = svc.blend_with_external(bayesian=8.0, external_0_10=7.0, C=6.0)
    # 0.7*8 + 0.3*7 = 7.7
    assert final == 7.7
