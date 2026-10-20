"""
Creator-side management of tournament battles (drafts, entries, publishing
settings, deletion, follows) plus the lazy-advance helpers used by reads and
by the internal cron endpoint. Round/vote mechanics live in tournament_service.
"""
import uuid
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import RankVerseError
from app.modules.entities.models import Entity

from . import bracket, pool
from . import tournament_service as engine
from .tournament_models import Battle, BattleFollow, BattleMatch, BattleParticipant

_bad = engine._bad


async def get_by_slug(db: AsyncSession, slug: str) -> Battle | None:
    return (await db.execute(select(Battle).where(Battle.slug == slug))).scalar_one_or_none()


def can_view(battle: Battle, user_id: uuid.UUID | None) -> bool:
    """A draft is the creator's alone; every other state is open to anyone with the link."""
    if battle.status == "draft":
        return user_id is not None and battle.creator_id == user_id
    return True


def require_owner(battle: Battle, user_id: uuid.UUID) -> None:
    if battle.creator_id != user_id:
        raise _bad("نبرد پیدا نشد", 404)  # same answer as a missing one: don't reveal drafts


def validate_title(title: str) -> str:
    title = title.strip()
    if not settings.battle_title_min_length <= len(title) <= settings.battle_title_max_length:
        raise _bad(f"عنوان باید بین {settings.battle_title_min_length} تا {settings.battle_title_max_length} حرف باشد")
    return title


async def create_draft(
    db: AsyncSession, user_id: uuid.UUID, *, title: str, description: str | None,
    cover_url: str | None, entity_type: str, bracket_size: int, now: datetime, mode: str = "pool",
) -> Battle:
    if bracket_size not in bracket.BRACKET_SIZES:
        raise _bad("اندازهٔ نبرد باید ۴، ۸ یا ۱۶ باشد")
    recent = (
        await db.execute(
            select(func.count()).select_from(Battle).where(
                Battle.creator_id == user_id, Battle.created_at >= now - timedelta(days=1)
            )
        )
    ).scalar_one()
    if settings.battle_max_new_per_day > 0 and recent >= settings.battle_max_new_per_day:
        raise RankVerseError("سقف ساخت نبرد در روز پر شده؛ فردا دوباره امتحان کن", status_code=429, code="rate_limited")
    battle = Battle(
        slug=engine.new_slug(), creator_id=user_id, title=validate_title(title),
        description=(description or "").strip() or None, cover_url=cover_url,
        entity_type=entity_type, bracket_size=bracket_size, mode=mode,
    )
    for _ in range(3):  # a 62^8 collision is vanishingly rare, but a retry is cheap
        if await get_by_slug(db, battle.slug) is None:
            break
        battle.slug = engine.new_slug()
    db.add(battle)
    await db.flush()
    return battle


async def participants_in_order(db: AsyncSession, battle_id: uuid.UUID) -> list[BattleParticipant]:
    return list(
        (
            await db.execute(
                select(BattleParticipant).where(BattleParticipant.battle_id == battle_id).order_by(BattleParticipant.seed)
            )
        ).scalars()
    )


async def update_details(db: AsyncSession, battle: Battle, fields: dict) -> Battle:
    """Title/description/cover any time; entity type and bracket size only in a
    draft (changing the type empties the entries, since they must match it)."""
    if battle.status == "archived":
        raise _bad("نبرد بایگانی‌شده قابل ویرایش نیست")
    structural = {k: v for k, v in fields.items() if k in ("entity_type", "bracket_size")}
    if structural and battle.status != "draft":
        raise _bad("نوع و اندازهٔ نبرد فقط در پیش‌نویس قابل تغییر است")
    if "title" in fields:
        battle.title = validate_title(fields["title"])
    if "description" in fields:
        battle.description = (fields["description"] or "").strip() or None
    if "cover_url" in fields:
        battle.cover_url = fields["cover_url"] or None
    if structural:
        entries = await participants_in_order(db, battle.id)
        if "bracket_size" in structural:
            if structural["bracket_size"] not in bracket.BRACKET_SIZES:
                raise _bad("اندازهٔ نبرد باید ۴، ۸ یا ۱۶ باشد")
            battle.bracket_size = structural["bracket_size"]
            for extra in entries[battle.bracket_size:]:
                await db.delete(extra)
        if "entity_type" in structural and structural["entity_type"] != battle.entity_type:
            battle.entity_type = structural["entity_type"]
            for row in entries:
                await db.delete(row)
    await db.flush()
    return battle


async def set_entries(db: AsyncSession, battle: Battle, entity_ids: list[uuid.UUID]) -> None:
    """Replace a draft's entries with this ordered list (up to the bracket size)."""
    if battle.status != "draft":
        raise _bad("گزینه‌ها فقط در پیش‌نویس قابل تغییرند")
    if len(entity_ids) > battle.bracket_size:
        raise _bad(f"حداکثر {battle.bracket_size} گزینه مجاز است")
    if len(set(entity_ids)) != len(entity_ids):
        raise _bad("یک گزینه بیش از یک بار آمده است")
    entities = list((await db.execute(select(Entity).where(Entity.id.in_(entity_ids)))).scalars()) if entity_ids else []
    if len(entities) != len(entity_ids):
        raise _bad("یکی از گزینه‌ها پیدا نشد")
    engine.validate_entities_compatible(entities, battle.entity_type)
    for row in await participants_in_order(db, battle.id):
        await db.delete(row)
    await db.flush()
    for seed, entity_id in enumerate(entity_ids, start=1):
        db.add(BattleParticipant(battle_id=battle.id, entity_id=entity_id, seed=seed))
    await db.flush()


async def publish_draft(
    db: AsyncSession, battle: Battle, *, randomize: bool, round_duration_seconds: int | None,
    visibility: str, now: datetime,
) -> Battle:
    active = (
        await db.execute(
            select(func.count()).select_from(Battle).where(
                Battle.creator_id == battle.creator_id, Battle.status == "active"
            )
        )
    ).scalar_one()
    if settings.battle_max_active_per_user > 0 and active >= settings.battle_max_active_per_user:
        raise RankVerseError("به سقف نبردهای منتشرشده رسیده‌ای؛ اول یکی از نبردهایت را بایگانی کن", status_code=429, code="rate_limited")
    entries = await participants_in_order(db, battle.id)
    if battle.mode == "pool":  # no rounds or randomised seeding: the pool is playable as is
        return await pool.publish_pool(db, battle, [p.entity_id for p in entries], visibility=visibility, now=now)
    return await engine.publish(
        db, battle, [p.entity_id for p in entries], randomize=randomize,
        round_duration_seconds=round_duration_seconds, visibility=visibility, now=now,
    )


async def set_visibility(db: AsyncSession, battle: Battle, visibility: str) -> Battle:
    if battle.status == "draft":
        raise _bad("اول نبرد را منتشر کن")
    if battle.status == "archived":
        raise _bad("نبرد بایگانی‌شده قابل ویرایش نیست")
    if visibility not in ("unlisted", "public"):
        raise _bad("دسترسی نامعتبر است")
    battle.visibility = visibility
    await db.flush()
    return battle


async def delete_battle(db: AsyncSession, battle: Battle) -> str:
    """A draft is really deleted; a published battle is archived so its results
    and links keep working (it just leaves every listing)."""
    if battle.status == "draft":
        await db.delete(battle)
        await db.flush()
        return "deleted"
    battle.status = "archived"
    battle.visibility = "unlisted"
    await db.flush()
    return "archived"


async def set_follow(db: AsyncSession, battle: Battle, user_id: uuid.UUID, follow: bool) -> None:
    existing = await db.get(BattleFollow, (battle.id, user_id))
    if follow and existing is None:
        db.add(BattleFollow(battle_id=battle.id, user_id=user_id))
    elif not follow and existing is not None:
        await db.delete(existing)
    await db.flush()


async def advance_if_needed(db: AsyncSession, battle: Battle, now: datetime) -> Battle:
    """Cheap lock-free pre-check, so a read only takes the row lock when the
    current round is actually overdue."""
    if battle.status != "active":
        return battle
    deadline = (
        await db.execute(
            select(func.min(BattleMatch.closes_at)).where(
                BattleMatch.battle_id == battle.id, BattleMatch.round == battle.current_round
            )
        )
    ).scalar_one_or_none()
    if deadline is not None and deadline <= now:
        battle = await engine.advance_if_due(db, battle.id, now)
        await db.commit()
    return battle


async def advance_all_due(db: AsyncSession, now: datetime) -> int:
    """For an external cron: advance every active battle whose round is overdue."""
    due = (
        await db.execute(
            select(Battle.id)
            .join(BattleMatch, (BattleMatch.battle_id == Battle.id) & (BattleMatch.round == Battle.current_round))
            .where(Battle.status == "active", BattleMatch.closes_at <= now)
            .distinct()
        )
    ).scalars().all()
    advanced = 0
    for battle_id in due:
        before = (await db.get(Battle, battle_id)).current_round
        battle = await engine.advance_if_due(db, battle_id, now)
        await db.commit()
        advanced += int(battle.current_round != before or battle.status != "active")
    return advanced
