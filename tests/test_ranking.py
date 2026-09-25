"""
Unit tests for the Bayesian ranking formula (no DB required for the pure-math part).
Run with: pytest tests/test_ranking.py
"""
from app.modules.ranking.service import RankingService


class FakeSettings:
    ranking_min_votes = 50
    ranking_user_weight = 0.7
    ranking_external_weight = 0.3
    ranking_battle_weight = 0.5
    ranking_battle_min_matches = 20


def make_service():
    svc = RankingService.__new__(RankingService)  # bypass __init__ (no db needed)
    svc.m = FakeSettings.ranking_min_votes
    svc.alpha = FakeSettings.ranking_user_weight
    svc.beta = FakeSettings.ranking_external_weight
    svc.battle_weight = FakeSettings.ranking_battle_weight
    svc.battle_k = FakeSettings.ranking_battle_min_matches
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


def test_no_battles_leaves_score_unchanged():
    svc = make_service()
    assert svc.battle_adjustment(elo=None, matches=0) == 0.0
    # an Elo row with no decided battles (only skips) doesn't count either
    assert svc.battle_adjustment(elo=1200.0, matches=0) == 0.0


def test_battle_wins_raise_and_losses_lower_the_score():
    svc = make_service()
    assert svc.battle_adjustment(elo=1300.0, matches=10) > 0
    assert svc.battle_adjustment(elo=1100.0, matches=10) < 0
    assert svc.battle_adjustment(elo=1200.0, matches=10) == 0.0


def test_battle_adjustment_grows_with_matches_played():
    svc = make_service()
    few = svc.battle_adjustment(elo=1400.0, matches=2)
    many = svc.battle_adjustment(elo=1400.0, matches=200)
    assert 0 < few < many


def test_battle_adjustment_is_capped_at_battle_weight():
    svc = make_service()
    # 20 matches = k -> half confidence; +400 Elo = full strength
    assert svc.battle_adjustment(elo=1600.0, matches=20) == 0.25
    # far past the +/-400 spread and the k threshold, still never beyond w
    assert svc.battle_adjustment(elo=3000.0, matches=100_000) <= 0.5
    assert svc.battle_adjustment(elo=0.0, matches=100_000) >= -0.5
