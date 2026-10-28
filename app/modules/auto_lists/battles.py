"""Creates the daily "winner stays" pool battles, each under one of the site's
own accounts picked at random (see service.py for the shared design).

A battle takes 4, 8 or 16 movies of one theme: a random sample of the theme's
best-ranked movies, so the same actor/decade gives different line-ups over time.
Each battle carries `curation_note = "auto:<tehran day>:<slot>|<theme key>"`
(admin panel only); the key stops a theme from being used twice.
"""
import logging
import random
from datetime import datetime

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.auto_lists.service import MARKER_PREFIX, owners, pick_owner, configured_emails
from app.modules.auto_lists.texts import publish_hour, render_actor_battle, render_decade_battle
from app.modules.auto_lists.themes import find_theme
from app.modules.battles import tournament_manage as manage
from app.modules.battles.tournament_models import Battle
from app.modules.daily_battle.tehran import TEHRAN_TZ, tehran_today, utcnow

logger = logging.getLogger(__name__)

_ADVISORY_KEY = 7_421_930_018
_ATTEMPTS = 12
_SIZES = (4, 8, 8, 16)  # 8 is the usual size


async def _made_today(db: AsyncSession, day) -> int:
    stmt = select(func.count(Battle.id)).where(Battle.curation_note.like(f"{MARKER_PREFIX}{day.isoformat()}:%"))
    return (await db.execute(stmt)).scalar_one()


async def _key_used(db: AsyncSession, key: str) -> bool:
    stmt = select(Battle.id).where(Battle.curation_note.like(f"{MARKER_PREFIX}%|{key}")).limit(1)
    return (await db.execute(stmt)).first() is not None


def pick_size(rng: random.Random, available: int) -> int | None:
    sizes = [s for s in _SIZES if s <= available]
    return rng.choice(sizes) if sizes else None


async def create_daily_battle(db: AsyncSession, now: datetime | None = None) -> Battle | None:
    """Create the next of today's battles when it is due; returns it, or None
    when nothing was created (disabled, too early, quota reached, or no
    usable theme)."""
    if not settings.auto_battles_enabled:
        return None
    now = now or utcnow()
    day = tehran_today(now)

    got = (await db.execute(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": _ADVISORY_KEY})).scalar_one()
    if not got:
        await db.rollback()
        return None

    slot = await _made_today(db, day)
    if slot >= settings.auto_battles_per_day or now.astimezone(TEHRAN_TZ).hour < publish_hour(day, slot):
        await db.rollback()
        return None

    users = await owners(db)
    if not users:
        logger.warning("auto battles: no active user among %s", configured_emails())
        await db.rollback()
        return None
    owner = pick_owner(users, day, slot, "battle")

    async def is_used(key: str, _tags: list[str]) -> bool:
        return await _key_used(db, key)

    theme = None
    size = None
    rng = random.Random(f"{day.isoformat()}:{slot}:battle-theme")
    for _ in range(_ATTEMPTS):
        # Up to 32 best-ranked candidates; at least 4 are needed for the smallest battle.
        theme = await find_theme(db, rng, min_items=4, pool_size=32, is_used=is_used)
        if theme:
            size = pick_size(rng, len(theme.movies))
            if size:
                break
            theme = None
    if theme is None or size is None:
        logger.warning("auto battles: no usable theme found for %s", day)
        await db.rollback()
        return None

    # Best-ranked 2x the size, then a random sample: varied but still strong line-ups.
    entrants = rng.sample(theme.movies[: size * 2], size)
    if theme.kind == "actor":
        title, description = render_actor_battle(rng, theme.person_fa, theme.genre_fa, size)
    else:
        title, description = render_decade_battle(rng, theme.decade, theme.genre_fa, size)

    battle = await manage.create_draft(
        db, owner.id, title=title, description=description, cover_url=None,
        entity_type="movie", bracket_size=size, now=now, mode="pool",
    )
    await manage.set_entries(db, battle, [m.id for m in entrants])
    battle.curation_note = f"{MARKER_PREFIX}{day.isoformat()}:{slot}|{theme.key}"
    await manage.publish_draft(
        db, battle, randomize=False, round_duration_seconds=None, visibility="public", now=now
    )
    await db.commit()
    logger.info("auto battles: created %s for %s (%d entrants)", battle.slug, owner.email, size)
    return battle
