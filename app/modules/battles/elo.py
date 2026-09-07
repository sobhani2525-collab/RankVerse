"""
Standard Elo rating calculation.

K-factor is higher for entities with few matches (so new/unrated items
converge quickly) and lower for well-established entities (so a single
vote can't swing a heavily-voted item too much). This is a simple
provisional-rating scheme; swap for TrueSkill later if you need
uncertainty-aware matchmaking too.
"""

K_FACTOR_PROVISIONAL = 40  # matches_played < PROVISIONAL_THRESHOLD
K_FACTOR_ESTABLISHED = 16
PROVISIONAL_THRESHOLD = 20


def _k_factor(matches_played: int) -> int:
    return K_FACTOR_PROVISIONAL if matches_played < PROVISIONAL_THRESHOLD else K_FACTOR_ESTABLISHED


def expected_score(rating_a: float, rating_b: float) -> float:
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400.0))


def update_ratings(
    left_rating: float,
    right_rating: float,
    left_matches: int,
    right_matches: int,
    outcome: str,  # "left" | "right" | "skip"
) -> tuple[float, float]:
    """Returns (new_left_rating, new_right_rating)."""
    if outcome == "skip":
        return left_rating, right_rating

    expected_left = expected_score(left_rating, right_rating)
    expected_right = 1.0 - expected_left

    actual_left = 1.0 if outcome == "left" else 0.0
    actual_right = 1.0 - actual_left

    k_left = _k_factor(left_matches)
    k_right = _k_factor(right_matches)

    new_left = left_rating + k_left * (actual_left - expected_left)
    new_right = right_rating + k_right * (actual_right - expected_right)
    return round(new_left, 2), round(new_right, 2)
