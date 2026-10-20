"""
Read models for tournament battles. The server decides what each viewer may
see: is_owner is computed here, and a match's vote split stays hidden until the
viewer has voted on it or it is closed (so early results can't sway the crowd).
"""
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.entities.models import Entity
from app.modules.users.models import User

from . import bracket, pool
from .tournament_models import Battle, BattleFollow, BattleMatch, BattleParticipant, BattleVote


def entity_brief(entity: Entity) -> dict:
    attrs = entity.attributes or {}
    return {
        "id": str(entity.id),
        "slug": entity.slug,
        "entity_type": entity.entity_type,
        "title": entity.title,
        "title_fa": attrs.get("title_fa"),
        "poster_url": attrs.get("poster_url") or attrs.get("poster_path") or attrs.get("image_url"),
        "year": attrs.get("year") if isinstance(attrs.get("year"), int) else None,
    }


async def _entities(db: AsyncSession, ids: set[uuid.UUID]) -> dict[uuid.UUID, dict]:
    if not ids:
        return {}
    rows = (await db.execute(select(Entity).where(Entity.id.in_(ids)))).scalars()
    return {e.id: entity_brief(e) for e in rows}


def battle_summary(battle: Battle, viewer_id: uuid.UUID | None) -> dict:
    return {
        "slug": battle.slug,
        "mode": battle.mode,
        "title": battle.title,
        "description": battle.description,
        "cover_url": battle.cover_url,
        "entity_type": battle.entity_type,
        "bracket_size": battle.bracket_size,
        "visibility": battle.visibility,
        "status": battle.status,
        "is_official": battle.is_official,
        "round_duration_seconds": battle.round_duration_seconds,
        "current_round": battle.current_round,
        "total_rounds": bracket.total_rounds(battle.bracket_size),
        "started_at": battle.started_at,
        "completed_at": battle.completed_at,
        "created_at": battle.created_at,
        "is_owner": viewer_id is not None and battle.creator_id == viewer_id,
    }


async def battle_list_items(db: AsyncSession, battles: list[Battle], viewer_id: uuid.UUID | None) -> list[dict]:
    """Summaries with the winner and up to four entrant posters, in two queries."""
    if not battles:
        return []
    ids = [b.id for b in battles]
    previews: dict[uuid.UUID, list[uuid.UUID]] = {}
    rows = await db.execute(
        select(BattleParticipant.battle_id, BattleParticipant.entity_id)
        .where(BattleParticipant.battle_id.in_(ids), BattleParticipant.seed <= 4)
        .order_by(BattleParticipant.seed)
    )
    for battle_id, entity_id in rows.all():
        previews.setdefault(battle_id, []).append(entity_id)
    needed = {e for lst in previews.values() for e in lst} | {b.winner_entity_id for b in battles if b.winner_entity_id}
    briefs = await _entities(db, needed)
    out = []
    for b in battles:
        item = battle_summary(b, viewer_id)
        item["preview"] = [briefs[e] for e in previews.get(b.id, []) if e in briefs]
        item["winner"] = briefs.get(b.winner_entity_id) if b.winner_entity_id else None
        out.append(item)
    return out


async def battle_detail(db: AsyncSession, battle: Battle, viewer_id: uuid.UUID | None) -> dict:
    data = battle_summary(battle, viewer_id)
    creator = await db.get(User, battle.creator_id) if battle.creator_id else None
    data["creator"] = (
        {"username": creator.username, "display_name": creator.display_name, "avatar_key": creator.avatar_key}
        if creator is not None else None
    )
    participants = (
        await db.execute(
            select(BattleParticipant).where(BattleParticipant.battle_id == battle.id).order_by(BattleParticipant.seed)
        )
    ).scalars().all()
    matches = (
        await db.execute(
            select(BattleMatch).where(BattleMatch.battle_id == battle.id).order_by(BattleMatch.round, BattleMatch.position)
        )
    ).scalars().all()

    counts: dict[tuple[uuid.UUID, uuid.UUID], int] = {}
    mine: dict[uuid.UUID, uuid.UUID] = {}
    if matches:
        match_ids = [m.id for m in matches]
        for match_id, chosen, n in (
            await db.execute(
                select(BattleVote.match_id, BattleVote.chosen_entity_id, func.count())
                .where(BattleVote.match_id.in_(match_ids))
                .group_by(BattleVote.match_id, BattleVote.chosen_entity_id)
            )
        ).all():
            counts[(match_id, chosen)] = n
        if viewer_id is not None:
            mine = dict(
                (
                    await db.execute(
                        select(BattleVote.match_id, BattleVote.chosen_entity_id).where(
                            BattleVote.match_id.in_(match_ids), BattleVote.user_id == viewer_id
                        )
                    )
                ).all()
            )

    briefs = await _entities(
        db,
        {p.entity_id for p in participants} | ({battle.winner_entity_id} if battle.winner_entity_id else set()),
    )
    seeds = {p.entity_id: p.seed for p in participants}

    rounds: dict[int, list[dict]] = {}
    for m in matches:
        reveal = m.status == "closed" or m.id in mine
        votes_a = counts.get((m.id, m.entity_a_id), 0) if m.entity_a_id else 0
        votes_b = counts.get((m.id, m.entity_b_id), 0) if m.entity_b_id else 0
        rounds.setdefault(m.round, []).append({
            "id": str(m.id),
            "position": m.position,
            "status": m.status,
            "opens_at": m.opens_at,
            "closes_at": m.closes_at,
            "entity_a": ({**briefs[m.entity_a_id], "seed": seeds[m.entity_a_id]} if m.entity_a_id else None),
            "entity_b": ({**briefs[m.entity_b_id], "seed": seeds[m.entity_b_id]} if m.entity_b_id else None),
            "winner_entity_id": str(m.winner_entity_id) if m.winner_entity_id else None,
            "votes_a": votes_a if reveal else None,
            "votes_b": votes_b if reveal else None,
            "my_vote": str(mine[m.id]) if m.id in mine else None,
        })

    if battle.mode == "pool":
        total_picks, my_picks = await pool.pick_counts(db, battle.id, viewer_id)
        # The standings stay hidden until the viewer has played (so they can't just follow the crowd);
        # the owner and a finished battle see them straight away.
        show = my_picks > 0 or data["is_owner"] or battle.status in ("completed", "archived")
        board = await pool.leaderboard(db, battle.id) if show else None
        data["total_picks"] = total_picks
        data["my_pick_count"] = my_picks
        data["leaderboard"] = (
            [{**r, "entity": briefs[r["entity_id"]], "entity_id": str(r["entity_id"])} for r in board if r["entity_id"] in briefs]
            if board is not None else None
        )

    current = rounds.get(battle.current_round, [])
    data.update({
        "participants": [{**briefs[p.entity_id], "seed": p.seed} for p in participants if p.entity_id in briefs],
        "rounds": [{"round": r, "matches": ms} for r, ms in sorted(rounds.items())],
        "winner": briefs.get(battle.winner_entity_id) if battle.winner_entity_id else None,
        "current_round_closes_at": (current[0]["closes_at"] if current and battle.status == "active" else None),
        "total_votes": sum(counts.values()),
        "follower_count": (
            await db.execute(select(func.count()).select_from(BattleFollow).where(BattleFollow.battle_id == battle.id))
        ).scalar_one(),
        "is_following": viewer_id is not None
        and await _is_following(db, battle.id, viewer_id),
    })
    return data


async def _is_following(db: AsyncSession, battle_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    return await db.get(BattleFollow, (battle_id, user_id)) is not None
