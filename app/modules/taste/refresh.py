"""
Taste DNA refresh after a user action that changes its inputs (a rating,
a favorite toggle).

The genre dimensions, snapshot, insight and anchors take ~14 sequential
queries (~2s from the backend to the DB), so they run after the response
instead of inside the request: `refresh` schedules a background task that
recomputes them in its own session. Contribution stats stay in the request
(ContributionStatsComputer, two queries) since the profile shows them.

Callers must `await refresh(...)` only after committing the change, so the
background session reads it. Per user, at most one refresh runs at a time;
actions during a run queue exactly one more run, so rating several titles
quickly still ends on the latest state. A failed or interrupted run (e.g. a
deploy restart) is caught up by the nightly batch recompute.

Tests swap `refresh` for `refresh_now` (tests/conftest.py), which runs the
same recompute inline in the caller's session -- the background path opens
sessions on the real DATABASE_URL.
"""
import asyncio
import logging
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.modules.taste.compute import (
    TasteAnchorComputer,
    TasteDimensionComputer,
    TasteInsightComputer,
    TasteSnapshotComputer,
)

logger = logging.getLogger(__name__)

_running: dict[uuid.UUID, asyncio.Task] = {}
_rerun: set[uuid.UUID] = set()


async def recompute_taste_dna(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Snapshot/insight read the dimension row(s), so they must run after them."""
    await TasteDimensionComputer(db).compute_genre_dimensions(user_id)
    await TasteSnapshotComputer(db).compute_snapshot(user_id)
    await TasteInsightComputer(db).compute_insight(user_id)
    await TasteAnchorComputer(db).compute_anchors(user_id)


async def refresh_later(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Production `refresh`: `db` is the request's session and isn't used."""
    if user_id in _running:
        _rerun.add(user_id)
        return
    _running[user_id] = asyncio.get_running_loop().create_task(_refresh_in_background(user_id))


async def refresh_now(db: AsyncSession, user_id: uuid.UUID) -> None:
    await recompute_taste_dna(db, user_id)
    await db.commit()


refresh = refresh_later


async def _refresh_in_background(user_id: uuid.UUID) -> None:
    try:
        while True:
            _rerun.discard(user_id)
            try:
                async with AsyncSessionLocal() as db:
                    await recompute_taste_dna(db, user_id)
                    await db.commit()
            except Exception:
                logger.exception("Background Taste DNA refresh failed for user %s", user_id)
            if user_id not in _rerun:
                return
    finally:
        _running.pop(user_id, None)
