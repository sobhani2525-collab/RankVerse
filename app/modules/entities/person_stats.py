"""Rebuilds the person_stats summary table behind the people ranking.

One aggregation per (role, origin) -- the same credit scan list_people used to
run on every cache miss -- written in a single transaction, so readers see
either the old table or the new one, never a half-built mix.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, insert, literal, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache
from app.core.database import AsyncSessionLocal, engine
from app.modules.entities.models import Entity, PersonStats
from app.modules.entities.repository import PEOPLE_ROLE_TYPES, credit_stats_query, shrunk_score

logger = logging.getLogger(__name__)

ORIGINS = ("all", "persian", "foreign")

_refresh_lock = asyncio.Lock()
# Postgres advisory lock key: only one process (script, endpoint, or any app
# instance's background loop) rebuilds the table at a time.
_ADVISORY_KEY = 7_421_930_001
_STARTUP_DELAY_SECONDS = 60
_CHECK_EVERY_SECONDS = 1800


def is_refreshing() -> bool:
    return _refresh_lock.locked()


async def refresh_person_stats(db: AsyncSession) -> int | None:
    """Replace person_stats with fresh totals; returns the row count, or None
    when another process is already rebuilding it."""
    async with _refresh_lock:
        # Transaction-scoped: released by the commit below (or any failure).
        got = (await db.execute(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": _ADVISORY_KEY})).scalar_one()
        if not got:
            await db.rollback()
            return None
        await db.execute(delete(PersonStats))
        for role in PEOPLE_ROLE_TYPES:
            for origin in ORIGINS:
                credits = credit_stats_query(role, origin).subquery()
                await db.execute(
                    insert(PersonStats).from_select(
                        ["person_id", "role", "origin", "works", "scored", "avg_score", "shrunk", "updated_at"],
                        select(
                            credits.c.person_id,
                            literal(role),
                            literal(origin),
                            credits.c.works,
                            credits.c.scored,
                            credits.c.avg_score,
                            shrunk_score(credits.c.scored, credits.c.avg_score),
                            func.now(),
                        )
                        .join(Entity, Entity.id == credits.c.person_id)
                        .where(Entity.entity_type == "person"),
                    )
                )
                logger.info("person_stats: built role=%s origin=%s", role, origin)
        await db.commit()
        cache.clear()  # this worker's cached people lists predate the rebuild
        return (await db.execute(select(func.count()).select_from(PersonStats))).scalar_one()


async def vacuum_person_stats() -> None:
    """VACUUM ANALYZE after a rebuild: the DELETE + INSERT leaves ~240k dead
    rows that make every scan of the table slow until autovacuum catches up,
    and the planner statistics start out describing the old contents. Needs
    a connection outside a transaction (the engine is AUTOCOMMIT)."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("VACUUM (ANALYZE) person_stats"))
    except Exception:
        logger.warning("VACUUM ANALYZE person_stats failed", exc_info=True)


_known_fresh_until: datetime | None = None  # this process already saw the table fresh until then


async def refresh_if_stale(max_age: timedelta) -> bool:
    """Rebuild unless the table was built within max_age. True if it rebuilt.
    The freshness check scans the table, so a process that has seen it fresh
    doesn't look again until that moment has passed."""
    global _known_fresh_until
    now = datetime.now(timezone.utc)
    if _known_fresh_until is not None and now < _known_fresh_until:
        return False
    async with AsyncSessionLocal() as db:
        built = (await db.execute(select(func.max(PersonStats.updated_at)))).scalar_one()
        if built is not None and now - built < max_age:
            _known_fresh_until = built + max_age
            return False
        rebuilt = await refresh_person_stats(db) is not None
    if rebuilt:
        _known_fresh_until = datetime.now(timezone.utc) + max_age
        await vacuum_person_stats()
    return rebuilt


async def refresh_loop(interval_hours: int) -> None:
    """Keeps person_stats fresh from inside the app (no cron on Liara). Every
    instance runs this; the table's own updated_at and the advisory lock make
    sure the aggregation runs about once per interval overall."""
    await asyncio.sleep(_STARTUP_DELAY_SECONDS)
    while True:
        try:
            if await refresh_if_stale(timedelta(hours=interval_hours)):
                logger.info("person_stats refreshed in background")
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("person_stats background refresh failed")
        await asyncio.sleep(_CHECK_EVERY_SECONDS)
