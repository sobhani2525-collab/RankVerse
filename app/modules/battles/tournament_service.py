"""
Tournament battle engine: publishing a bracket, voting, and round advancement.

There is no cron, so rounds advance lazily: advance_if_due() runs whenever a
battle is read or voted on, under a row lock on the battle (SELECT ... FOR
UPDATE) so two concurrent requests can't close the same round twice. Every
decision is deterministic -- see bracket.pick_winner for the tie rule.

Functions take an AsyncSession and a `now`, never reading the clock
themselves, and flush but don't commit (the caller owns the transaction).
"""
import secrets
import string
import uuid
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RankVerseError
from app.modules.entities.models import Entity

from . import bracket, tournament_score
from .tournament_models import (
    Battle,
    BattleMatch,
    BattleParticipant,
    BattleVote,
)

_SLUG_ALPHABET = string.digits + string.ascii_letters  # base62
SLUG_LENGTH = 8


def new_slug() -> str:
    return "".join(secrets.choice(_SLUG_ALPHABET) for _ in range(SLUG_LENGTH))


def _bad(detail: str, code: int = 400) -> RankVerseError:
    return RankVerseError(detail, status_code=code, code="battle_error")


def validate_entities_compatible(entities: list[Entity], entity_type: str) -> None:
    """All entrants must share the battle's entity_type. This is the one place
    the same-type rule lives: to allow mixed brackets later, relax it here."""
    for entity in entities:
        if entity.entity_type != entity_type:
            raise _bad(
                f"All entries must be of type '{entity_type}' (got '{entity.entity_type}' for '{entity.id}')"
            )


async def lock_battle(db: AsyncSession, battle_id: uuid.UUID) -> Battle:
    battle = (
        await db.execute(
            select(Battle).where(Battle.id == battle_id).with_for_update().execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if battle is None:
        raise _bad("Battle not found", 404)
    return battle


async def _round_matches(db: AsyncSession, battle_id: uuid.UUID, rnd: int) -> list[BattleMatch]:
    return list(
        (
            await db.execute(
                select(BattleMatch)
                .where(BattleMatch.battle_id == battle_id, BattleMatch.round == rnd)
                .order_by(BattleMatch.position)
            )
        ).scalars()
    )


async def _vote_counts(db: AsyncSession, match_ids: list[uuid.UUID]) -> dict[tuple[uuid.UUID, uuid.UUID], int]:
    rows = await db.execute(
        select(BattleVote.match_id, BattleVote.chosen_entity_id, func.count())
        .where(BattleVote.match_id.in_(match_ids))
        .group_by(BattleVote.match_id, BattleVote.chosen_entity_id)
    )
    return {(m, e): n for m, e, n in rows.all()}


def _round_window(battle: Battle, now: datetime) -> tuple[datetime, datetime | None]:
    duration = battle.round_duration_seconds
    return now, (now + timedelta(seconds=duration) if duration else None)


async def publish(
    db: AsyncSession,
    battle: Battle,
    entity_ids_in_order: list[uuid.UUID],
    *,
    randomize: bool,
    round_duration_seconds: int | None,
    visibility: str,
    now: datetime,
) -> Battle:
    """Draft -> active: fix the seeding, create every match, open round 1."""
    battle = await lock_battle(db, battle.id)
    if battle.status != "draft":
        raise _bad("Only a draft can be published")
    if visibility not in ("unlisted", "public"):
        raise _bad("A published battle must be unlisted or public")
    if len(set(entity_ids_in_order)) != len(entity_ids_in_order):
        raise _bad("An entry appears more than once")
    if len(entity_ids_in_order) != battle.bracket_size:
        raise _bad(f"This bracket needs exactly {battle.bracket_size} entries")
    if round_duration_seconds is not None and round_duration_seconds <= 0:
        raise _bad("Round duration must be positive")

    entities = list(
        (await db.execute(select(Entity).where(Entity.id.in_(entity_ids_in_order)))).scalars()
    )
    if len(entities) != len(entity_ids_in_order):
        raise _bad("An entry no longer exists")
    validate_entities_compatible(entities, battle.entity_type)

    battle.seed_value = secrets.randbits(62) if randomize else None
    seeded = bracket.assign_seeds(entity_ids_in_order, battle.seed_value)

    existing = (
        await db.execute(select(BattleParticipant).where(BattleParticipant.battle_id == battle.id))
    ).scalars()
    for row in existing:
        await db.delete(row)
    await db.flush()
    for seed, entity_id in enumerate(seeded, start=1):
        db.add(BattleParticipant(battle_id=battle.id, entity_id=entity_id, seed=seed))

    battle.round_duration_seconds = round_duration_seconds  # _round_window reads it
    opens_at, closes_at = _round_window(battle, now)
    pairs = bracket.first_round_pairs(seeded)
    rounds = bracket.total_rounds(battle.bracket_size)
    for rnd in range(1, rounds + 1):
        for pos in range(battle.bracket_size >> rnd):
            match = BattleMatch(battle_id=battle.id, round=rnd, position=pos)
            if rnd == 1:
                match.entity_a_id, match.entity_b_id = pairs[pos]
                match.status, match.opens_at, match.closes_at = "open", opens_at, closes_at
            db.add(match)

    battle.status = "active"
    battle.visibility = visibility
    battle.round_duration_seconds = round_duration_seconds
    battle.current_round = 1
    battle.started_at = now
    await db.flush()
    return battle


async def _close_current_round(db: AsyncSession, battle: Battle, now: datetime) -> None:
    """Decide every match of the current round, then open the next round or
    crown the champion. Caller holds the battle lock."""
    matches = await _round_matches(db, battle.id, battle.current_round)
    counts = await _vote_counts(db, [m.id for m in matches])
    seeds = {
        p.entity_id: p.seed
        for p in (
            await db.execute(select(BattleParticipant).where(BattleParticipant.battle_id == battle.id))
        ).scalars()
    }
    decided: list[BattleMatch] = []
    for match in matches:
        if match.status == "closed":
            continue
        decided.append(match)
        match.winner_entity_id = bracket.pick_winner(
            match.entity_a_id,
            match.entity_b_id,
            counts.get((match.id, match.entity_a_id), 0),
            counts.get((match.id, match.entity_b_id), 0),
            seeds[match.entity_a_id],
            seeds[match.entity_b_id],
        )
        match.status = "closed"
        match.closes_at = min(match.closes_at, now) if match.closes_at else now
    await db.flush()
    await tournament_score.apply_match_scores(db, battle, decided)

    if battle.current_round >= bracket.total_rounds(battle.bracket_size):
        battle.status = "completed"
        battle.completed_at = now
        battle.winner_entity_id = matches[0].winner_entity_id
    else:
        battle.current_round += 1
        opens_at, closes_at = _round_window(battle, now)
        for match in await _round_matches(db, battle.id, battle.current_round):
            feeder_a, feeder_b = bracket.feeder_positions(match.position)
            match.entity_a_id = matches[feeder_a].winner_entity_id
            match.entity_b_id = matches[feeder_b].winner_entity_id
            match.status, match.opens_at, match.closes_at = "open", opens_at, closes_at
    await db.flush()


async def advance_if_due(db: AsyncSession, battle_id: uuid.UUID, now: datetime) -> Battle:
    """Close the current round if its deadline has passed. Safe to call on every
    read/vote: it locks the battle and re-checks, so concurrent callers advance
    a round once."""
    battle = await lock_battle(db, battle_id)
    if battle.status != "active":
        return battle
    # A late round opens at `now`, not back-dated, so voters get their full
    # window even if nobody touched the battle for days: at most one round
    # closes per call.
    current = await _round_matches(db, battle.id, battle.current_round)
    deadline = current[0].closes_at if current else None
    if deadline is not None and deadline <= now:
        await _close_current_round(db, battle, now)
    return battle


async def close_round_now(db: AsyncSession, battle_id: uuid.UUID, now: datetime) -> Battle:
    battle = await lock_battle(db, battle_id)
    if battle.status != "active" or battle.mode != "tournament":
        raise _bad("The battle is not an active tournament")
    await _close_current_round(db, battle, now)
    return battle


async def finish_battle(db: AsyncSession, battle_id: uuid.UUID, now: datetime) -> Battle:
    """End the whole battle: close the current round on the votes so far, then
    play out the remaining rounds on the same rules (they have no votes yet, so
    the higher seed advances)."""
    battle = await lock_battle(db, battle_id)
    if battle.status != "active" or battle.mode != "tournament":
        raise _bad("The battle is not an active tournament")
    while battle.status == "active":
        await _close_current_round(db, battle, now)
    return battle


async def extend_round(db: AsyncSession, battle_id: uuid.UUID, extra_seconds: int, now: datetime) -> Battle:
    if extra_seconds <= 0:
        raise _bad("The extension must be positive")
    battle = await lock_battle(db, battle_id)
    if battle.status != "active" or battle.mode != "tournament":
        raise _bad("The battle is not an active tournament")
    for match in await _round_matches(db, battle.id, battle.current_round):
        base = match.closes_at if match.closes_at and match.closes_at > now else now
        match.closes_at = base + timedelta(seconds=extra_seconds)
    await db.flush()
    return battle


async def cast_vote(
    db: AsyncSession,
    battle_id: uuid.UUID,
    match_id: uuid.UUID,
    user_id: uuid.UUID,
    chosen_entity_id: uuid.UUID,
    now: datetime,
) -> BattleVote:
    """Record or change a user's vote on an open match of the current round."""
    battle = await advance_if_due(db, battle_id, now)
    if battle.status != "active":
        raise _bad("This battle is not accepting votes")
    match = (
        await db.execute(select(BattleMatch).where(BattleMatch.id == match_id, BattleMatch.battle_id == battle.id))
    ).scalar_one_or_none()
    if match is None:
        raise _bad("Match not found", 404)
    if match.round != battle.current_round or match.status != "open":
        raise _bad("This match is closed", 409)
    if chosen_entity_id not in (match.entity_a_id, match.entity_b_id):
        raise _bad("The chosen entry is not in this match")

    vote = (
        await db.execute(select(BattleVote).where(BattleVote.match_id == match.id, BattleVote.user_id == user_id))
    ).scalar_one_or_none()
    if vote is None:
        vote = BattleVote(match_id=match.id, user_id=user_id, chosen_entity_id=chosen_entity_id)
        db.add(vote)
    else:
        vote.chosen_entity_id = chosen_entity_id
    await db.flush()
    return vote
