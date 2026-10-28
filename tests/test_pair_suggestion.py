import random
import uuid

from app.modules.battles.pair_suggestion import pick_tied_pair


def ids(n):
    return [uuid.uuid4() for _ in range(n)]


def test_prefers_highest_tied_score():
    a, b, c, d, e = ids(5)
    pair = pick_tied_pair([(a, 4), (b, 4), (c, 5), (d, 3), (e, 3)], random.Random(1))
    assert pair[2] == 4 and set(pair[:2]) == {a, b}


def test_ignores_low_scores_and_singletons():
    a, b, c = ids(3)
    assert pick_tied_pair([(a, 2), (b, 2), (c, 4)], random.Random(1)) is None
