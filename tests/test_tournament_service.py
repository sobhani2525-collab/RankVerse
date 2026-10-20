"""
Tournament battle engine: publishing, voting, lazy round advancement, ties,
the final round and manual finishing.

Needs Postgres: TEST_DATABASE_URL=... pytest tests/test_tournament_service.py
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.core.exceptions import RankVerseError
from app.core.security import hash_password
from app.modules.battles import tournament_service as svc
from app.modules.battles.tournament_models import Battle, BattleMatch, BattleParticipant, BattleVote
from app.modules.entities.repository import EntityRepository
from app.modules.users.repository import UserRepository

T0 = datetime(2026, 10, 20, 9, 0, tzinfo=timezone.utc)
HOUR = 3600


async def _entities(db, n, entity_type="movie"):
    repo = EntityRepository(db)
    return [
        await repo.create_entity(
            entity_type=entity_type, external_id=None, external_source=None,
            title=f"t{i}", slug=f"t{i}-{uuid.uuid4().hex[:6]}", attributes={},
        )
        for i in range(n)
    ]


async def _users(db, n):
    repo = UserRepository(db)
    return [
        await repo.create(
            email=f"u{i}-{uuid.uuid4().hex[:4]}@example.com", username=f"u{i}{uuid.uuid4().hex[:4]}",
            hashed_password=hash_password("Sup3rSecret!1"),
        )
        for i in range(n)
    ]


async def _draft(db, size=4, entity_type="movie"):
    battle = Battle(slug=svc.new_slug(), title="b", entity_type=entity_type, bracket_size=size)
    db.add(battle)
    await db.flush()
    return battle


async def _published(db, size=4, duration=HOUR, randomize=False):
    entities = await _entities(db, size)
    battle = await _draft(db, size)
    await svc.publish(
        db, battle, [e.id for e in entities], randomize=randomize,
        round_duration_seconds=duration, visibility="public", now=T0,
    )
    return battle, entities


async def _matches(db, battle, rnd):
    return list(
        (await db.execute(
            select(BattleMatch).where(BattleMatch.battle_id == battle.id, BattleMatch.round == rnd)
            .order_by(BattleMatch.position)
        )).scalars()
    )


async def test_publish_creates_bracket(db_session):
    battle, entities = await _published(db_session, size=8)
    assert battle.status == "active" and battle.current_round == 1 and battle.seed_value is None
    sizes = [len(await _matches(db_session, battle, r)) for r in (1, 2, 3)]
    assert sizes == [4, 2, 1]
    first = await _matches(db_session, battle, 1)
    assert all(m.status == "open" and m.closes_at == T0 + timedelta(hours=1) for m in first)
    # creator order kept: seed 1 meets seed 8
    assert (first[0].entity_a_id, first[0].entity_b_id) == (entities[0].id, entities[7].id)
    assert all(m.status == "pending" for m in await _matches(db_session, battle, 2))


async def test_publish_rejects_wrong_count_and_mixed_types(db_session):
    entities = await _entities(db_session, 3)
    battle = await _draft(db_session, 4)
    with pytest.raises(RankVerseError):
        await svc.publish(db_session, battle, [e.id for e in entities], randomize=False,
                          round_duration_seconds=None, visibility="public", now=T0)
    mixed = await _entities(db_session, 3) + await _entities(db_session, 1, "tv_series")
    with pytest.raises(RankVerseError):
        await svc.publish(db_session, battle, [e.id for e in mixed], randomize=False,
                          round_duration_seconds=None, visibility="public", now=T0)


async def test_random_seeding_stores_seed_and_is_reproducible(db_session):
    battle, entities = await _published(db_session, size=16, randomize=True)
    assert battle.seed_value is not None
    from app.modules.battles import bracket
    expected = bracket.assign_seeds([e.id for e in entities], battle.seed_value)
    rows = (await db_session.execute(
        select(BattleParticipant).where(BattleParticipant.battle_id == battle.id).order_by(BattleParticipant.seed)
    )).scalars()
    assert [r.entity_id for r in rows] == expected


async def test_vote_is_upserted_and_one_per_user(db_session):
    battle, _ = await _published(db_session)
    (user,) = await _users(db_session, 1)
    match = (await _matches(db_session, battle, 1))[0]
    await svc.cast_vote(db_session, battle.id, match.id, user.id, match.entity_a_id, T0)
    await svc.cast_vote(db_session, battle.id, match.id, user.id, match.entity_b_id, T0 + timedelta(minutes=5))
    votes = list((await db_session.execute(select(BattleVote).where(BattleVote.match_id == match.id))).scalars())
    assert len(votes) == 1 and votes[0].chosen_entity_id == match.entity_b_id


async def test_vote_for_entity_outside_match_rejected(db_session):
    battle, _ = await _published(db_session)
    (user,) = await _users(db_session, 1)
    first, second = (await _matches(db_session, battle, 1))[:2]
    with pytest.raises(RankVerseError):
        await svc.cast_vote(db_session, battle.id, first.id, user.id, second.entity_a_id, T0)


async def test_round_advances_lazily_on_votes_and_tie_goes_to_higher_seed(db_session):
    battle, entities = await _published(db_session)
    u1, u2, u3 = await _users(db_session, 3)
    m0, m1 = (await _matches(db_session, battle, 1))
    # match 0: seed1 (entities[0]) vs seed4 -> 4 gets 2 votes, 1 gets 1
    await svc.cast_vote(db_session, battle.id, m0.id, u1.id, entities[3].id, T0)
    await svc.cast_vote(db_session, battle.id, m0.id, u2.id, entities[3].id, T0)
    await svc.cast_vote(db_session, battle.id, m0.id, u3.id, entities[0].id, T0)
    # match 1: seed2 vs seed3 -> one vote each = tie -> seed2 advances
    await svc.cast_vote(db_session, battle.id, m1.id, u1.id, entities[1].id, T0)
    await svc.cast_vote(db_session, battle.id, m1.id, u2.id, entities[2].id, T0)

    # before the deadline nothing advances
    assert (await svc.advance_if_due(db_session, battle.id, T0 + timedelta(minutes=59))).current_round == 1
    later = T0 + timedelta(hours=2)
    battle = await svc.advance_if_due(db_session, battle.id, later)
    assert battle.current_round == 2
    final = (await _matches(db_session, battle, 2))[0]
    assert (final.entity_a_id, final.entity_b_id) == (entities[3].id, entities[1].id)
    assert final.status == "open" and final.opens_at == later and final.closes_at == later + timedelta(hours=1)
    # idempotent: a second call at the same instant doesn't advance again
    assert (await svc.advance_if_due(db_session, battle.id, later)).current_round == 2


async def test_votes_to_a_closed_round_rejected_and_final_completes(db_session):
    battle, entities = await _published(db_session)
    (user,) = await _users(db_session, 1)
    old = (await _matches(db_session, battle, 1))[0]
    later = T0 + timedelta(hours=2)
    with pytest.raises(RankVerseError):  # voting itself triggers the advance, then the match is closed
        await svc.cast_vote(db_session, battle.id, old.id, user.id, old.entity_a_id, later)
    battle = await svc.lock_battle(db_session, battle.id)
    assert battle.current_round == 2

    end = later + timedelta(hours=2)
    battle = await svc.advance_if_due(db_session, battle.id, end)
    assert battle.status == "completed" and battle.completed_at == end
    # no votes anywhere: seed 1 wins every match
    assert battle.winner_entity_id == entities[0].id


async def test_manual_battle_never_advances_by_time(db_session):
    battle, _ = await _published(db_session, duration=None)
    far = T0 + timedelta(days=30)
    assert (await svc.advance_if_due(db_session, battle.id, far)).current_round == 1
    battle = await svc.close_round_now(db_session, battle.id, far)
    assert battle.current_round == 2
    assert (await _matches(db_session, battle, 2))[0].closes_at is None


async def test_finish_battle_plays_out_remaining_rounds(db_session):
    battle, entities = await _published(db_session, size=8, duration=None)
    (user,) = await _users(db_session, 1)
    m = (await _matches(db_session, battle, 1))[0]  # seed1 vs seed8
    await svc.cast_vote(db_session, battle.id, m.id, user.id, entities[7].id, T0)
    battle = await svc.finish_battle(db_session, battle.id, T0 + timedelta(hours=1))
    assert battle.status == "completed" and battle.winner_entity_id is not None
    assert (await db_session.execute(
        select(func.count()).select_from(BattleMatch).where(
            BattleMatch.battle_id == battle.id, BattleMatch.status != "closed")
    )).scalar_one() == 0
    first = (await _matches(db_session, battle, 1))[0]
    assert first.winner_entity_id == entities[7].id  # the vote beat the seed
    with pytest.raises(RankVerseError):
        await svc.finish_battle(db_session, battle.id, T0)


async def test_extend_round_pushes_deadline(db_session):
    battle, _ = await _published(db_session)
    await svc.extend_round(db_session, battle.id, 2 * HOUR, T0 + timedelta(minutes=30))
    for m in await _matches(db_session, battle, 1):
        assert m.closes_at == T0 + timedelta(hours=3)
    assert (await svc.advance_if_due(db_session, battle.id, T0 + timedelta(hours=2))).current_round == 1


# --- effect on the ranking score ----------------------------------------------

async def _elo(db, entity):
    from app.modules.battles.models import EntityEloScore

    row = (await db.execute(select(EntityEloScore).where(EntityEloScore.entity_id == entity.id))).scalar_one_or_none()
    return (row.elo_score, row.matches_played) if row else (1200.0, 0)


async def _vote_match(db, battle, match, users, choose, now=T0):
    for user in users:
        await svc.cast_vote(db, battle.id, match.id, user.id, choose, now)


async def _first_round_result(db, battle, users, pick_seed_1=True):
    """All `users` back the stronger seed in match 0 (entities[0] vs entities[3])."""
    m0 = (await _matches(db, battle, 1))[0]
    await _vote_match(db, battle, m0, users, m0.entity_a_id if pick_seed_1 else m0.entity_b_id)
    await svc.close_round_now(db, battle.id, T0 + timedelta(hours=1))
    return m0


async def test_official_battle_moves_elo_in_full(db_session):
    battle, entities = await _published(db_session)
    battle.is_official = True
    await _first_round_result(db_session, battle, await _users(db_session, 5))
    assert await _elo(db_session, entities[0]) == (1220.0, 1)  # K=40, even match: +20
    assert await _elo(db_session, entities[3]) == (1180.0, 1)


async def test_user_battle_is_weighted(db_session):
    battle, entities = await _published(db_session)
    await _first_round_result(db_session, battle, await _users(db_session, 5))
    assert await _elo(db_session, entities[0]) == (1205.0, 1)  # 20 * BATTLE_USER_WEIGHT (0.25)
    assert await _elo(db_session, entities[3]) == (1195.0, 1)
    m0 = (await _matches(db_session, battle, 1))[0]
    assert (m0.score_delta_a, m0.score_delta_b) == (5.0, -5.0)


async def test_too_few_voters_has_no_effect(db_session):
    battle, entities = await _published(db_session)
    battle.is_official = True
    m0 = await _first_round_result(db_session, battle, await _users(db_session, 4))
    assert await _elo(db_session, entities[0]) == (1200.0, 0)
    assert m0.score_delta_a == 0.0  # looked at and settled: never re-scored


async def test_creator_vote_does_not_count(db_session):
    battle, entities = await _published(db_session)
    battle.is_official = True
    users = await _users(db_session, 5)
    battle.creator_id = users[0].id  # 5 voters, but one is the creator -> only 4 count
    await _first_round_result(db_session, battle, users)
    assert await _elo(db_session, entities[0]) == (1200.0, 0)


async def test_tie_among_counted_votes_has_no_effect(db_session, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "battle_min_voters_for_score", 2)
    battle, entities = await _published(db_session)
    battle.is_official = True
    u1, u2 = await _users(db_session, 2)
    m0 = (await _matches(db_session, battle, 1))[0]
    await svc.cast_vote(db_session, battle.id, m0.id, u1.id, m0.entity_a_id, T0)
    await svc.cast_vote(db_session, battle.id, m0.id, u2.id, m0.entity_b_id, T0)
    await svc.close_round_now(db_session, battle.id, T0 + timedelta(hours=1))
    assert await _elo(db_session, entities[0]) == (1200.0, 0)  # seed 1 advanced, but not as evidence


async def test_one_battle_cannot_move_an_entity_past_the_cap(db_session):
    battle, entities = await _published(db_session)
    battle.is_official = True
    users = await _users(db_session, 5)
    m0, m1 = await _matches(db_session, battle, 1)
    await _vote_match(db_session, battle, m0, users, m0.entity_a_id)  # seed 1 beats seed 4
    await _vote_match(db_session, battle, m1, users, m1.entity_a_id)  # seed 2 beats seed 3
    await svc.close_round_now(db_session, battle.id, T0 + timedelta(hours=1))
    final = (await _matches(db_session, battle, 2))[0]
    await _vote_match(db_session, battle, final, users, final.entity_a_id, T0 + timedelta(hours=1))
    await svc.close_round_now(db_session, battle.id, T0 + timedelta(hours=2))
    # +20 in round 1, +20 more in the final, but the default cap is 24 per battle
    assert (await _elo(db_session, entities[0]))[0] == 1224.0
