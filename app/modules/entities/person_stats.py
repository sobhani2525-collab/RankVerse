"""Rebuilds the person_stats summary table behind the people ranking.

One aggregation per (role, origin) -- the same credit scan list_people used to
run on every cache miss -- written in a single transaction, so readers see
either the old table or the new one, never a half-built mix.
"""
import asyncio
import logging

from sqlalchemy import delete, func, insert, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache
from app.modules.entities.models import Entity, PersonStats
from app.modules.entities.repository import PEOPLE_ROLE_TYPES, credit_stats_query, shrunk_score

logger = logging.getLogger(__name__)

ORIGINS = ("all", "persian", "foreign")

_refresh_lock = asyncio.Lock()


def is_refreshing() -> bool:
    return _refresh_lock.locked()


async def refresh_person_stats(db: AsyncSession) -> int:
    """Replace person_stats with fresh totals; returns the row count."""
    async with _refresh_lock:
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
