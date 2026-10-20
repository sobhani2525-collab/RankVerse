"""
How a tournament battle's closed matches feed the ranking score.

There is no separate score path: a decided match updates the same
EntityEloScore rows the quick pairwise battles do, and RankingService folds
them into computed_score via its existing battle_adjustment. What differs is
how much a match counts:

  - an official battle counts in full, a user battle by `battle_user_weight`;
  - only CLOSED matches count, and only once (score_delta_* mark it applied);
  - the outcome is read from votes excluding the creator's own, and a match
    needs `battle_min_voters_for_score` distinct such voters;
  - a tie among those votes carries no signal (the bracket's seed tie-break
    advances someone, but it isn't evidence of preference), so no effect;
  - one battle moves one entity by at most `battle_max_elo_effect` Elo points
    in total, however many rounds it plays.
"""
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.entities.models import Entity
from app.modules.ranking.service import RankingService

from .elo import update_ratings
from .repository import BattleRepository
from .tournament_models import Battle, BattleMatch, BattleVote


def battle_weight(battle: Battle) -> float:
    return 1.0 if battle.is_official else settings.battle_user_weight


async def apply_match_scores(db: AsyncSession, battle: Battle, matches: list[BattleMatch]) -> None:
    """Score `matches` (just decided, in round order). Flushes; the caller commits."""
    weight = battle_weight(battle)
    todo = [m for m in matches if m.score_delta_a is None and m.entity_a_id and m.entity_b_id]
    if weight <= 0 or not todo:
        return

    vote_query = (
        select(BattleVote.match_id, BattleVote.chosen_entity_id, func.count())
        .where(BattleVote.match_id.in_([m.id for m in todo]))
        .group_by(BattleVote.match_id, BattleVote.chosen_entity_id)
    )
    if battle.creator_id is not None:
        vote_query = vote_query.where(BattleVote.user_id != battle.creator_id)
    counts = {(m, e): n for m, e, n in (await db.execute(vote_query)).all()}

    # What this battle already moved each entity by, for the per-battle cap.
    used: dict[uuid.UUID, float] = {}
    earlier = (
        await db.execute(
            select(BattleMatch).where(BattleMatch.battle_id == battle.id, BattleMatch.score_delta_a.is_not(None))
        )
    ).scalars()
    for m in earlier:
        used[m.entity_a_id] = used.get(m.entity_a_id, 0.0) + abs(m.score_delta_a)
        used[m.entity_b_id] = used.get(m.entity_b_id, 0.0) + abs(m.score_delta_b or 0.0)

    entity_ids = sorted({e for m in todo for e in (m.entity_a_id, m.entity_b_id)})
    elo = await BattleRepository(db).lock_elo_rows(entity_ids, battle.entity_type)
    cap = settings.battle_max_elo_effect

    touched: set[uuid.UUID] = set()
    for match in todo:
        votes_a = counts.get((match.id, match.entity_a_id), 0)
        votes_b = counts.get((match.id, match.entity_b_id), 0)
        deltas = [0.0, 0.0]
        if votes_a + votes_b >= settings.battle_min_voters_for_score and votes_a != votes_b:
            row_a, row_b = elo[match.entity_a_id], elo[match.entity_b_id]
            new_a, new_b = update_ratings(
                row_a.elo_score, row_b.elo_score, row_a.matches_played, row_b.matches_played,
                "left" if votes_a > votes_b else "right",
            )
            for i, (entity_id, row, new) in enumerate(((match.entity_a_id, row_a, new_a), (match.entity_b_id, row_b, new_b))):
                delta = (new - row.elo_score) * weight
                room = max(cap - used.get(entity_id, 0.0), 0.0)
                delta = max(-room, min(room, delta))
                if delta:
                    row.elo_score = round(row.elo_score + delta, 2)
                    row.matches_played += 1
                    used[entity_id] = used.get(entity_id, 0.0) + abs(delta)
                    touched.add(entity_id)
                deltas[i] = delta
        # 0.0 (not NULL) marks "looked at, nothing to apply", so it is never re-scored
        match.score_delta_a, match.score_delta_b = deltas

    if touched:
        entities = list((await db.execute(select(Entity).where(Entity.id.in_(touched)))).scalars())
        await RankingService(db).recompute_entities(entities)
    await db.flush()
