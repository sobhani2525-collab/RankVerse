"""
Pool battles: the creator picks 4/8/16 entries; anyone plays them through "winner
stays" (the same run as the home page's arena) and every head-to-head choice is a
pick. There are no rounds or deadlines; the page shows a leaderboard built from all
picks.

Picks feed the ranking score through the same EntityEloScore rows quick battles
use, scaled down (`battle_user_weight`, or fully for an official battle):
  - the creator's own picks have no effect;
  - a pair counts once per user (playing it again only changes the choice);
  - one battle moves one entity by at most `battle_max_elo_effect` Elo points.
"""
import uuid
from datetime import datetime

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.entities.models import Entity
from app.modules.ranking.service import RankingService

from . import tournament_service as engine
from .elo import update_ratings
from .repository import BattleRepository
from .tournament_models import Battle, BattleParticipant, BattlePick
from .tournament_score import battle_weight

_bad = engine._bad


async def publish_pool(
    db: AsyncSession, battle: Battle, entity_ids_in_order: list[uuid.UUID], *, visibility: str, now: datetime
) -> Battle:
    """Draft -> active. No matches are created: the pool is playable immediately."""
    battle = await engine.lock_battle(db, battle.id)
    if battle.status != "draft":
        raise _bad("Only a draft can be published")
    if visibility not in ("unlisted", "public"):
        raise _bad("A published battle must be unlisted or public")
    if len(set(entity_ids_in_order)) != len(entity_ids_in_order):
        raise _bad("An entry appears more than once")
    if len(entity_ids_in_order) != battle.bracket_size:
        raise _bad(f"This battle needs exactly {battle.bracket_size} entries")
    entities = list((await db.execute(select(Entity).where(Entity.id.in_(entity_ids_in_order)))).scalars())
    if len(entities) != len(entity_ids_in_order):
        raise _bad("An entry no longer exists")
    engine.validate_entities_compatible(entities, battle.entity_type)
    battle.status = "active"
    battle.visibility = visibility
    battle.started_at = now
    await db.flush()
    return battle


def _pair(a: uuid.UUID, b: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    return (a, b) if str(a) < str(b) else (b, a)


async def record_pick(
    db: AsyncSession, battle_id: uuid.UUID, user_id: uuid.UUID,
    champion_id: uuid.UUID, challenger_id: uuid.UUID, winner_id: uuid.UUID,
) -> BattlePick:
    battle = await engine.lock_battle(db, battle_id)  # serialises a user's double-click on one pair
    if battle.mode != "pool":
        raise _bad("This battle is not a pool battle")
    if battle.status != "active":
        raise _bad("This battle is not accepting picks", 409)
    if champion_id == challenger_id:
        raise _bad("A pick needs two different entries")
    if winner_id not in (champion_id, challenger_id):
        raise _bad("The winner must be one of the two entries")
    members = set(
        (await db.execute(select(BattleParticipant.entity_id).where(BattleParticipant.battle_id == battle.id))).scalars()
    )
    if champion_id not in members or challenger_id not in members:
        raise _bad("Both entries must be part of this battle")

    lo, hi = _pair(champion_id, challenger_id)
    pick = (
        await db.execute(
            select(BattlePick).where(
                BattlePick.battle_id == battle.id, BattlePick.user_id == user_id,
                BattlePick.entity_lo == lo, BattlePick.entity_hi == hi,
            )
        )
    ).scalar_one_or_none()
    if pick is not None:  # replaying a pair: the choice changes, the score effect isn't applied twice
        pick.winner_entity_id = winner_id
        await db.flush()
        return pick

    pick = BattlePick(battle_id=battle.id, user_id=user_id, entity_lo=lo, entity_hi=hi, winner_entity_id=winner_id)
    db.add(pick)
    await db.flush()
    await _apply_score(db, battle, pick, user_id)
    return pick


async def _apply_score(db: AsyncSession, battle: Battle, pick: BattlePick, user_id: uuid.UUID) -> None:
    weight = battle_weight(battle)
    if weight <= 0 or (battle.creator_id is not None and user_id == battle.creator_id):
        return

    def used(entity_id: uuid.UUID):
        return select(
            func.coalesce(
                func.sum(case((BattlePick.entity_lo == entity_id, func.abs(BattlePick.delta_lo)), else_=0.0))
                + func.sum(case((BattlePick.entity_hi == entity_id, func.abs(BattlePick.delta_hi)), else_=0.0)),
                0.0,
            )
        ).where(BattlePick.battle_id == battle.id, BattlePick.id != pick.id)

    elo = await BattleRepository(db).lock_elo_rows([pick.entity_lo, pick.entity_hi], battle.entity_type)
    row_lo, row_hi = elo[pick.entity_lo], elo[pick.entity_hi]
    new_lo, new_hi = update_ratings(
        row_lo.elo_score, row_hi.elo_score, row_lo.matches_played, row_hi.matches_played,
        "left" if pick.winner_entity_id == pick.entity_lo else "right",
    )
    touched = []
    for attr, entity_id, row, new in (("delta_lo", pick.entity_lo, row_lo, new_lo), ("delta_hi", pick.entity_hi, row_hi, new_hi)):
        room = max(settings.battle_max_elo_effect - float((await db.execute(used(entity_id))).scalar_one()), 0.0)
        delta = max(-room, min(room, (new - row.elo_score) * weight))
        if delta:
            row.elo_score = round(row.elo_score + delta, 2)
            row.matches_played += 1
            touched.append(entity_id)
        setattr(pick, attr, delta)
    if touched:
        entities = list((await db.execute(select(Entity).where(Entity.id.in_(touched)))).scalars())
        await RankingService(db).recompute_entities(entities)
    await db.flush()


def rank_rows(rows: list[dict], beat: dict[tuple[uuid.UUID, uuid.UUID], int]) -> list[dict]:
    """Order standings and number them. Entries are separated by win rate, then wins; entries
    still level are separated by their head-to-head record against each other (`beat[(a, b)]` =
    picks where a beat b); entries still level after that share a rank, and seed only fixes
    the display order within a shared rank."""
    for r in rows:
        r["win_rate"] = round(r["wins"] / r["played"], 4) if r["played"] else None

    def level(r):
        return (-(r["win_rate"] or 0.0), -r["wins"])

    groups: dict[tuple, list[dict]] = {}
    for r in rows:
        groups.setdefault(level(r), []).append(r)
    ordered: list[dict] = []
    for key in sorted(groups):
        group = groups[key]
        ids = [r["entity_id"] for r in group]
        for r in group:
            r["h2h"] = sum(beat.get((r["entity_id"], other), 0) for other in ids if other != r["entity_id"])
        group.sort(key=lambda r: (-r["h2h"], r["seed"]))
        ordered.extend(group)
    ahead_key = None
    rank = 0
    for position, r in enumerate(ordered, start=1):
        key = (*level(r), r["h2h"])
        if key != ahead_key:
            rank, ahead_key = position, key
        r["rank"] = rank
    return ordered


async def leaderboard(db: AsyncSession, battle_id: uuid.UUID) -> list[dict]:
    """Per entry: picks it won / was in, with a shared-rank ordering (see rank_rows)."""
    pairs = (
        await db.execute(
            select(BattlePick.entity_lo, BattlePick.entity_hi, BattlePick.winner_entity_id, func.count())
            .where(BattlePick.battle_id == battle_id)
            .group_by(BattlePick.entity_lo, BattlePick.entity_hi, BattlePick.winner_entity_id)
        )
    ).all()
    wins: dict[uuid.UUID, int] = {}
    played: dict[uuid.UUID, int] = {}
    beat: dict[tuple[uuid.UUID, uuid.UUID], int] = {}
    for lo, hi, winner, n in pairs:
        loser = hi if winner == lo else lo
        wins[winner] = wins.get(winner, 0) + n
        beat[(winner, loser)] = beat.get((winner, loser), 0) + n
        for entity_id in (lo, hi):
            played[entity_id] = played.get(entity_id, 0) + n
    seeds = dict(
        (await db.execute(
            select(BattleParticipant.entity_id, BattleParticipant.seed).where(BattleParticipant.battle_id == battle_id)
        )).all()
    )
    rows = [
        {"entity_id": e, "wins": wins.get(e, 0), "played": played.get(e, 0), "seed": seed}
        for e, seed in seeds.items()
    ]
    return rank_rows(rows, beat)


async def pick_counts(db: AsyncSession, battle_id: uuid.UUID, user_id: uuid.UUID | None) -> tuple[int, int]:
    """(all picks, this viewer's picks)."""
    total = (await db.execute(select(func.count()).select_from(BattlePick).where(BattlePick.battle_id == battle_id))).scalar_one()
    mine = 0
    if user_id is not None:
        mine = (
            await db.execute(
                select(func.count()).select_from(BattlePick).where(
                    BattlePick.battle_id == battle_id, BattlePick.user_id == user_id
                )
            )
        ).scalar_one()
    return total, mine

