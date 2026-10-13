"""Creates each day's daily battle ahead of the first visitor.

Picking the pair is slow (dozens of queries); without this the first visitor
after Tehran midnight waits for it. get_or_create_today is race-safe, so every
app instance can run this loop.
"""
import asyncio
import logging

from app.core.database import AsyncSessionLocal
from app.modules.daily_battle.service import DailyBattleService

logger = logging.getLogger(__name__)

_STARTUP_DELAY_SECONDS = 90
_CHECK_EVERY_SECONDS = 600


async def precreate_once() -> bool:
    """Make sure today's battle exists; True when one does."""
    async with AsyncSessionLocal() as db:
        return await DailyBattleService(db).get_or_create_today() is not None


async def precreate_loop() -> None:
    await asyncio.sleep(_STARTUP_DELAY_SECONDS)
    while True:
        try:
            await precreate_once()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("daily battle pre-creation failed")
        await asyncio.sleep(_CHECK_EVERY_SECONDS)
