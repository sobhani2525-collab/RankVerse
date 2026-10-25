"""
HTTP API for tournament battles, mounted under /battles. Fixed paths (/mine,
/internal/...) are declared before /{slug}; and this router is included after
the older pairwise-battle router so /battles/next|themed|vote keep winning.
"""
import random
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import NotFoundError
from app.core.schemas import Meta, envelope
from app.modules.auth.dependencies import ensure_email_verified, get_current_user, get_current_user_optional
from app.modules.sync.dependencies import verify_internal_api_key
from app.modules.entities.models import Entity
from app.modules.lists.service import ListService
from app.modules.search.router import _FOLD_TABLE, _escape_like, _fold_sql
from app.modules.users.models import User

from . import pool
from . import tournament_manage as manage
from . import tournament_service as engine
from . import tournament_views as views
from .tournament_candidates import find_candidates, list_genres
from .tournament_related import related_for_pool
from .tournament_models import Battle, BattleFollow, BattleMatch, BattleParticipant, BattlePick, BattleVote

router = APIRouter(prefix="/battles", tags=["tournament-battles"])

EntityType = Literal["movie", "tv_series"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


class BattleCreate(BaseModel):
    title: str = Field(..., max_length=200)
    description: str | None = Field(None, max_length=2000)
    cover_url: str | None = Field(None, max_length=500)
    entity_type: EntityType
    bracket_size: Literal[4, 8, 16]
    # "pool" = custom "winner stays" battle (the live format); "tournament" = parked elimination bracket
    mode: Literal["pool", "tournament"] = "pool"


class BattleUpdate(BaseModel):
    title: str | None = Field(None, max_length=200)
    description: str | None = Field(None, max_length=2000)
    cover_url: str | None = Field(None, max_length=500)
    entity_type: EntityType | None = None
    bracket_size: Literal[4, 8, 16] | None = None


class EntriesPayload(BaseModel):
    entity_ids: list[uuid.UUID] = Field(..., max_length=16)


class PublishPayload(BaseModel):
    randomize: bool = False
    round_duration_seconds: int | None = Field(None, ge=60, le=30 * 86400)  # None = manual
    visibility: Literal["unlisted", "public"] = "public"


class VisibilityPayload(BaseModel):
    visibility: Literal["unlisted", "public"]


class ExtendPayload(BaseModel):
    seconds: int = Field(..., ge=60, le=30 * 86400)


class PickPayload(BaseModel):
    champion_id: uuid.UUID
    challenger_id: uuid.UUID
    winner_id: uuid.UUID


class VotePayload(BaseModel):
    entity_id: uuid.UUID


async def _load(db: AsyncSession, slug: str, user: User | None) -> Battle:
    battle = await manage.get_by_slug(db, slug)
    if battle is None or not manage.can_view(battle, user.id if user else None):
        raise NotFoundError("نبرد پیدا نشد")
    return battle


async def _owned(db: AsyncSession, slug: str, user: User) -> Battle:
    battle = await manage.get_by_slug(db, slug)
    if battle is None:
        raise NotFoundError("نبرد پیدا نشد")
    manage.require_owner(battle, user.id)
    return battle


async def _detail(db: AsyncSession, battle: Battle, user: User | None) -> dict:
    return await views.battle_detail(db, battle, user.id if user else None)


@router.post("", status_code=201)
async def create_battle(
    payload: BattleCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    battle = await manage.create_draft(db, user.id, now=_now(), **payload.model_dump())
    await db.commit()
    return envelope(data={"slug": battle.slug})


_DIGITS_FROM = "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩"
_DIGITS_TO = "01234567890123456789"


def _search_conditions(q: str) -> list:
    """Title/description match with the global search's Persian folding, plus
    Persian/Arabic digits folded to Latin (titles are shown in Persian digits
    but may be stored either way)."""
    term = _escape_like(" ".join(q.translate(_FOLD_TABLE).translate(str.maketrans(_DIGITS_FROM, _DIGITS_TO)).split()))
    if not term:
        return []

    def fold(expr):
        return func.translate(_fold_sql(expr), _DIGITS_FROM, _DIGITS_TO)

    return [
        or_(
            fold(Battle.title).ilike(f"%{term}%"),
            fold(func.coalesce(Battle.description, "")).ilike(f"%{term}%"),
        )
    ]


@router.get("")
async def list_public_battles(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    status: Literal["active", "completed"] | None = None,
    entity_type: EntityType | None = None,
    sort: Literal["newest", "popular"] = "newest",
    mode: Literal["pool", "tournament"] = "pool",
    q: str | None = Query(None, max_length=100),
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    conditions = [
        Battle.mode == mode, Battle.visibility == "public", Battle.status.in_(("active", "completed")),
        Battle.is_hidden_from_discovery.is_(False),
    ]
    if status:
        conditions.append(Battle.status == status)
    if entity_type:
        conditions.append(Battle.entity_type == entity_type)
    if q:
        conditions.extend(_search_conditions(q))
    total = (await db.execute(select(func.count()).select_from(Battle).where(*conditions))).scalar_one()
    query = select(Battle).where(*conditions)
    if sort == "popular":
        match_votes = (
            select(BattleMatch.battle_id.label("battle_id"), func.count(BattleVote.id).label("n"))
            .join(BattleVote, BattleVote.match_id == BattleMatch.id)
            .group_by(BattleMatch.battle_id)
            .subquery()
        )
        picks = select(BattlePick.battle_id.label("battle_id"), func.count(BattlePick.id).label("n")).group_by(BattlePick.battle_id).subquery()
        query = (
            query.outerjoin(match_votes, match_votes.c.battle_id == Battle.id)
            .outerjoin(picks, picks.c.battle_id == Battle.id)
            .order_by(
                (func.coalesce(match_votes.c.n, 0) + func.coalesce(picks.c.n, 0)).desc(), Battle.created_at.desc()
            )
        )
    else:
        query = query.order_by(Battle.created_at.desc())
    battles = (await db.execute(query.offset((page - 1) * page_size).limit(page_size))).scalars().all()
    items = await views.battle_list_items(db, list(battles), user.id if user else None)
    return envelope(data=items, meta=Meta(page=page, page_size=page_size, total=total))


def _featured_conditions():
    return [
        Battle.is_featured.is_(True), Battle.is_hidden_from_discovery.is_(False), Battle.mode == "pool",
        Battle.visibility == "public", Battle.status == "active",
    ]


@router.get("/featured")
async def featured_battles(
    limit: int = Query(12, ge=1, le=24),
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Admin-curated battles, in the admin's order."""
    battles = (
        await db.execute(
            select(Battle).where(*_featured_conditions())
            .order_by(Battle.featured_order.asc().nulls_last(), Battle.featured_at.desc().nulls_last())
            .limit(limit)
        )
    ).scalars().all()
    return envelope(data=await views.battle_list_items(db, list(battles), user.id if user else None))


@router.get("/featured/random")
async def featured_random_battle(
    exclude: str | None = Query(None, max_length=8, description="slug to avoid, so a new run differs"),
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """One random featured battle with its entries, ready to play (null when none is featured)."""
    conditions = _featured_conditions()
    if exclude:
        conditions.append(Battle.slug != exclude)
    ids = list((await db.execute(select(Battle.id).where(*conditions))).scalars())
    if not ids and exclude:  # the only featured battle is the one just played
        ids = list((await db.execute(select(Battle.id).where(*_featured_conditions()))).scalars())
    if not ids:
        return envelope(data=None)
    battle = await db.get(Battle, random.choice(ids))
    return envelope(data=await views.battle_detail(db, battle, user.id if user else None))


@router.get("/mine")
async def my_battles(
    tab: Literal["draft", "active", "completed", "following", "played"] = "active",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    mode: Literal["pool", "tournament"] = "pool",
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if tab == "played":
        # Battles the user took part in, in either mode: a pick in a pool
        # battle or a vote on a tournament match. Newest activity isn't
        # stored per battle, so they're ordered by the battle's creation.
        played = select(BattlePick.battle_id).where(BattlePick.user_id == user.id).union(
            select(BattleMatch.battle_id)
            .join(BattleVote, BattleVote.match_id == BattleMatch.id)
            .where(BattleVote.user_id == user.id)
        )
        conditions = [Battle.id.in_(played), Battle.status.in_(("active", "completed"))]
    elif tab == "following":
        conditions = [
            Battle.mode == mode,
            Battle.id.in_(select(BattleFollow.battle_id).where(BattleFollow.user_id == user.id)),
            Battle.status.in_(("active", "completed")),
        ]
    else:
        conditions = [Battle.mode == mode, Battle.creator_id == user.id, Battle.status == tab]
    total = (await db.execute(select(func.count()).select_from(Battle).where(*conditions))).scalar_one()
    battles = (
        await db.execute(
            select(Battle).where(*conditions).order_by(Battle.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        )
    ).scalars().all()
    items = await views.battle_list_items(db, list(battles), user.id)
    return envelope(data=items, meta=Meta(page=page, page_size=page_size, total=total))


@router.get("/candidates")
async def candidates(
    entity_type: EntityType,
    person: str | None = Query(None, max_length=500, description="person slug"),
    role: Literal["all", "director", "actor", "creator"] = "all",
    genre: str | None = Query(None, max_length=500, description="genre slug"),
    decade: int | None = Query(None, ge=1880, le=2100, description="first year of the decade, e.g. 1990"),
    q: str | None = Query(None, max_length=80),
    page: int = Query(1, ge=1),
    page_size: int = Query(40, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Entities of one type matching ALL given filters (person, genre, decade, title text), best-scored first."""
    if decade is not None and decade % 10:
        raise engine._bad("دهه باید مضرب ۱۰ باشد")
    items, total = await find_candidates(
        db, entity_type=entity_type, person_slug=person, person_role=role, genre_slug=genre,
        decade=decade, q=q, limit=page_size, offset=(page - 1) * page_size,
    )
    return envelope(data=items, meta=Meta(page=page, page_size=page_size, total=total))


@router.get("/filter-genres")
async def filter_genres(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return envelope(data=await list_genres(db))


@router.get("/with-entity/{entity_id}")
async def battles_with_entity(
    entity_id: uuid.UUID,
    limit: int = Query(4, ge=1, le=12),
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Public battles one movie / series is an entry of (the title page's "related battles"):
    live ones first, then the newest."""
    battles = (
        await db.execute(
            select(Battle)
            .join(BattleParticipant, BattleParticipant.battle_id == Battle.id)
            .where(
                BattleParticipant.entity_id == entity_id,
                Battle.visibility == "public",
                Battle.status.in_(("active", "completed")),
                Battle.is_hidden_from_discovery.is_(False),
            )
            .order_by((Battle.status == "active").desc(), Battle.created_at.desc())
            .limit(limit)
        )
    ).scalars().unique().all()
    return envelope(data=await views.battle_list_items(db, list(battles), user.id if user else None))


@router.post("/internal/advance-due", dependencies=[Depends(verify_internal_api_key)])
async def advance_due(db: AsyncSession = Depends(get_db)):
    """For an external cron: advance every battle whose round deadline has passed."""
    return envelope(data={"advanced": await manage.advance_all_due(db, _now())})


@router.get("/{slug}")
async def get_battle(
    slug: str, user: User | None = Depends(get_current_user_optional), db: AsyncSession = Depends(get_db)
):
    battle = await _load(db, slug, user)
    battle = await manage.advance_if_needed(db, battle, _now())
    return envelope(data=await _detail(db, battle, user))


@router.get("/{slug}/related")
async def related(
    slug: str,
    sort: Literal["newest", "popular"] = "newest",
    limit: int = Query(6, ge=1, le=20),
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Related battles and lists. Pool battle: those sharing entries with it (most shared first).
    Tournament: for a finished one, other battles/lists the winner is in."""
    battle = await _load(db, slug, user)
    if battle.mode == "pool":
        if battle.status == "draft":
            return envelope(data={"winner": None, "battles": [], "lists": []})
        return envelope(data=await related_for_pool(db, battle, user.id if user else None, limit))
    if battle.status != "completed" or battle.winner_entity_id is None:
        return envelope(data={"winner": None, "battles": [], "lists": []})
    winner_id = battle.winner_entity_id
    query = (
        select(Battle)
        .join(BattleParticipant, BattleParticipant.battle_id == Battle.id)
        .where(
            BattleParticipant.entity_id == winner_id,
            Battle.id != battle.id,
            Battle.visibility == "public",
            Battle.status.in_(("active", "completed")),
        )
    )
    if sort == "popular":
        votes = (
            select(BattleMatch.battle_id.label("battle_id"), func.count(BattleVote.id).label("n"))
            .join(BattleVote, BattleVote.match_id == BattleMatch.id)
            .group_by(BattleMatch.battle_id)
            .subquery()
        )
        query = query.outerjoin(votes, votes.c.battle_id == Battle.id).order_by(
            func.coalesce(votes.c.n, 0).desc(), Battle.created_at.desc()
        )
    else:
        query = query.order_by(Battle.created_at.desc())
    battles = (await db.execute(query.limit(limit))).scalars().all()
    lists = (await ListService(db).get_lists_containing_entity(winner_id))[:limit]
    winner = (await db.execute(select(Entity).where(Entity.id == winner_id))).scalar_one()
    return envelope(data={
        "winner": views.entity_brief(winner),
        "battles": await views.battle_list_items(db, list(battles), user.id if user else None),
        "lists": [item.model_dump() for item in lists],
    })


@router.patch("/{slug}")
async def update_battle(
    slug: str, payload: BattleUpdate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    battle = await _owned(db, slug, user)
    await manage.update_details(db, battle, payload.model_dump(exclude_unset=True))
    await db.commit()
    return envelope(data=await _detail(db, battle, user))


@router.put("/{slug}/entries")
async def set_entries(
    slug: str, payload: EntriesPayload, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    battle = await _owned(db, slug, user)
    await manage.set_entries(db, battle, payload.entity_ids)
    await db.commit()
    return envelope(data=await _detail(db, battle, user))


@router.post("/{slug}/publish")
async def publish_battle(
    slug: str, payload: PublishPayload, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    battle = await _owned(db, slug, user)
    if payload.visibility == "public":
        ensure_email_verified(user)  # same anti-spam gate as public lists
    await manage.publish_draft(db, battle, now=_now(), **payload.model_dump())
    await db.commit()
    return envelope(data=await _detail(db, battle, user))


@router.post("/{slug}/visibility")
async def change_visibility(
    slug: str, payload: VisibilityPayload, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    battle = await _owned(db, slug, user)
    if payload.visibility == "public":
        ensure_email_verified(user)
    await manage.set_visibility(db, battle, payload.visibility)
    await db.commit()
    return envelope(data=await _detail(db, battle, user))


@router.post("/{slug}/close-round")
async def close_round(slug: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    battle = await _owned(db, slug, user)
    await engine.close_round_now(db, battle.id, _now())
    await db.commit()
    return envelope(data=await _detail(db, battle, user))


@router.post("/{slug}/finish")
async def finish(slug: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    battle = await _owned(db, slug, user)
    await engine.finish_battle(db, battle.id, _now())
    await db.commit()
    return envelope(data=await _detail(db, battle, user))


@router.post("/{slug}/extend")
async def extend(
    slug: str, payload: ExtendPayload, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    battle = await _owned(db, slug, user)
    await engine.extend_round(db, battle.id, payload.seconds, _now())
    await db.commit()
    return envelope(data=await _detail(db, battle, user))


@router.delete("/{slug}")
async def delete(slug: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    battle = await _owned(db, slug, user)
    outcome = await manage.delete_battle(db, battle)
    await db.commit()
    return envelope(data={"result": outcome})


@router.post("/{slug}/matches/{match_id}/vote")
async def vote(
    slug: str,
    match_id: uuid.UUID,
    payload: VotePayload,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    battle = await _load(db, slug, user)
    await engine.cast_vote(db, battle.id, match_id, user.id, payload.entity_id, _now())
    await db.commit()
    return envelope(data=await _detail(db, battle, user))


@router.post("/{slug}/picks")
async def record_pick(
    slug: str, payload: PickPayload, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """One head-to-head choice while playing a pool battle (champion vs challenger, winner stays)."""
    battle = await _load(db, slug, user)
    await pool.record_pick(db, battle.id, user.id, payload.champion_id, payload.challenger_id, payload.winner_id)
    await db.commit()
    return envelope(data={"recorded": True})


@router.put("/{slug}/follow")
async def follow(slug: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    battle = await _load(db, slug, user)
    await manage.set_follow(db, battle, user.id, True)
    await db.commit()
    return envelope(data={"is_following": True})


@router.delete("/{slug}/follow")
async def unfollow(slug: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    battle = await _load(db, slug, user)
    await manage.set_follow(db, battle, user.id, False)
    await db.commit()
    return envelope(data={"is_following": False})
