"""Pure bracket rules for tournament battles (no database needed)."""
import uuid

import pytest

from app.modules.battles import bracket


def ids(n):
    return [uuid.uuid4() for _ in range(n)]


@pytest.mark.parametrize("size,expected", [(4, [1, 4, 2, 3]), (8, [1, 8, 4, 5, 2, 7, 3, 6])])
def test_standard_seed_order(size, expected):
    assert bracket.standard_seed_order(size) == expected


@pytest.mark.parametrize("size", [4, 8, 16])
def test_round_one_pairs_sum_to_size_plus_one(size):
    order = bracket.standard_seed_order(size)
    assert sorted(order) == list(range(1, size + 1))
    for i in range(0, size, 2):
        assert order[i] + order[i + 1] == size + 1


def test_total_rounds_and_bad_size():
    assert [bracket.total_rounds(n) for n in (4, 8, 16)] == [2, 3, 4]
    with pytest.raises(ValueError):
        bracket.total_rounds(6)


def test_first_round_pairs_use_seeded_order():
    e = ids(4)
    assert bracket.first_round_pairs(e) == [(e[0], e[3]), (e[1], e[2])]


def test_random_seeding_is_reproducible_and_a_permutation():
    e = ids(16)
    a = bracket.assign_seeds(e, 12345)
    assert a == bracket.assign_seeds(e, 12345)
    assert sorted(a) == sorted(e)
    assert bracket.assign_seeds(e, None) == e
    assert any(bracket.assign_seeds(e, s) != a for s in range(1, 6))


def test_pick_winner_votes_then_seed_tiebreak():
    a, b = uuid.uuid4(), uuid.uuid4()
    assert bracket.pick_winner(a, b, 3, 2, 5, 1) == a
    assert bracket.pick_winner(a, b, 1, 2, 1, 5) == b
    assert bracket.pick_winner(a, b, 2, 2, 5, 1) == b  # tie -> lower seed number
    assert bracket.pick_winner(a, b, 0, 0, 1, 5) == a  # zero votes -> lower seed number


def test_feeder_positions():
    assert bracket.feeder_positions(0) == (0, 1)
    assert bracket.feeder_positions(3) == (6, 7)


# --- pool standings ---------------------------------------------------------------

def _row(entity, wins, played, seed):
    return {"entity_id": entity, "wins": wins, "played": played, "seed": seed}


def test_pool_standings_break_ties_by_head_to_head():
    from app.modules.battles.pool import rank_rows

    a, b, c = ids(3)
    rows = [_row(a, 4, 5, 1), _row(b, 4, 5, 2), _row(c, 1, 5, 3)]
    # a and b are level at 80%, but b beat a head to head -> b is first despite the worse seed
    ranked = rank_rows(rows, {(b, a): 2, (a, b): 1})
    assert [r["entity_id"] for r in ranked] == [b, a, c]
    assert [r["rank"] for r in ranked] == [1, 2, 3]


def test_pool_standings_share_a_rank_when_still_level():
    from app.modules.battles.pool import rank_rows

    a, b, c = ids(3)
    ranked = rank_rows([_row(a, 4, 5, 2), _row(b, 4, 5, 1), _row(c, 0, 5, 3)], {(a, b): 1, (b, a): 1})
    assert [r["entity_id"] for r in ranked] == [b, a, c]  # seed only orders the display
    assert [r["rank"] for r in ranked] == [1, 1, 3]  # standard competition ranking


def test_pool_standings_order_by_rate_then_wins_and_handle_no_picks():
    from app.modules.battles.pool import rank_rows

    a, b, c, d = ids(4)
    ranked = rank_rows([_row(a, 1, 1, 1), _row(b, 4, 4, 2), _row(c, 0, 0, 3), _row(d, 2, 4, 4)], {})
    assert [r["entity_id"] for r in ranked] == [b, a, d, c]  # 100% with more wins first; no picks last
    assert ranked[-1]["win_rate"] is None


def test_pool_standings_do_not_let_one_lucky_pick_outrank_a_solid_record():
    from app.modules.battles.pool import rank_rows

    batman, shining, good, men = ids(4)
    ranked = rank_rows(
        [_row(batman, 1, 1, 1), _row(shining, 3, 4, 2), _row(good, 2, 3, 3), _row(men, 1, 2, 4)], {}
    )
    assert [r["entity_id"] for r in ranked] == [shining, good, batman, men]
    assert [r["win_rate"] for r in ranked] == [0.75, 0.6667, 1.0, 0.5]  # shown rates stay the plain ones
