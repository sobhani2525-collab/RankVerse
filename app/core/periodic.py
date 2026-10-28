"""Housekeeping jobs that would be cron jobs elsewhere (there is no cron on
Liara). One loop in the app runs each job on its own interval, in its own DB
session; a failing job is logged and retried next time. All of them are safe
to run concurrently from several instances: tournament rounds lock the battle
and re-check, and the purges are plain DELETEs.

The same jobs stay reachable through the /internal/* endpoints for manual runs.
"""
import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

from app.core.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

_STARTUP_DELAY_SECONDS = 120
_TICK_SECONDS = 60


async def advance_tournament_rounds() -> int:
    """Close every tournament round whose deadline passed, so brackets move on
    (and followers get notified) even when nobody opens the battle."""
    from app.modules.battles.tournament_manage import advance_all_due

    async with AsyncSessionLocal() as db:
        return await advance_all_due(db, datetime.now(timezone.utc))


async def purge_old_notifications() -> int:
    from app.modules.notifications.service import NotificationService

    async with AsyncSessionLocal() as db:
        return await NotificationService(db).cleanup()


async def alerts_maintenance() -> dict:
    """Purge old resolved admin alerts and warn when the database grows large."""
    from app.modules.alerts.service import AlertService

    async with AsyncSessionLocal() as db:
        return await AlertService(db).maintenance()


async def create_daily_list() -> str | None:
    """Create today's auto list under the site account when it is due (see
    app/modules/auto_lists); a no-op unless AUTO_LISTS_ENABLED is set."""
    from app.config import settings

    if not settings.auto_lists_enabled:
        return None
    from app.modules.auto_lists.service import create_daily_list as run

    async with AsyncSessionLocal() as db:
        lst = await run(db)
        return lst.slug if lst else None


async def create_daily_battle() -> str | None:
    """Create the next due auto battle under a site account (see
    app/modules/auto_lists/battles.py); a no-op unless AUTO_BATTLES_ENABLED."""
    from app.config import settings

    if not settings.auto_battles_enabled:
        return None
    from app.modules.auto_lists.battles import create_daily_battle as run

    async with AsyncSessionLocal() as db:
        battle = await run(db)
        return battle.slug if battle else None


# (name, job, interval in seconds)
JOBS: list[tuple[str, Callable[[], Awaitable[object]], int]] = [
    ("tournament rounds", advance_tournament_rounds, 5 * 60),
    ("notification cleanup", purge_old_notifications, 6 * 3600),
    ("alerts maintenance", alerts_maintenance, 6 * 3600),
    ("daily auto list", create_daily_list, 20 * 60),
    ("daily auto battle", create_daily_battle, 20 * 60),
]


async def run_due(last_run: dict[str, float], now: float) -> None:
    """Runs every job whose interval has passed since its last run (or that never ran)."""
    for name, job, interval in JOBS:
        if now - last_run.get(name, float("-inf")) < interval:
            continue
        last_run[name] = now
        try:
            result = await job()
            logger.info("periodic job %s done: %s", name, result)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("periodic job %s failed", name)


async def periodic_loop() -> None:
    await asyncio.sleep(_STARTUP_DELAY_SECONDS)
    last_run: dict[str, float] = {}
    while True:
        await run_due(last_run, time.monotonic())
        await asyncio.sleep(_TICK_SECONDS)
