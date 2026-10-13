"""In-process TTL cache for anonymous, user-independent responses.

There is no Redis on Liara, so this lives in each worker's memory. Only store
fully serialized data (dicts / pydantic dumps), never ORM objects.
"""
import asyncio
import logging
import time
from typing import Any, Awaitable, Callable, Hashable

from app.config import settings

logger = logging.getLogger(__name__)


class TTLCache:
    def __init__(self, max_entries: int = 500):
        self.max_entries = max_entries
        self._data: dict[Hashable, tuple[float, Any]] = {}  # key -> (expires_at, value)
        self._locks: dict[Hashable, asyncio.Lock] = {}

    def clear(self) -> None:
        self._data.clear()
        self._locks.clear()

    def _evict(self) -> None:
        if len(self._data) < self.max_entries:
            return
        now = time.monotonic()
        for k in [k for k, (exp, _) in self._data.items() if exp <= now]:
            del self._data[k]
        # Still full of live entries: drop the ones closest to expiry.
        while len(self._data) >= self.max_entries:
            del self._data[min(self._data, key=lambda k: self._data[k][0])]

    async def get_or_set(self, key: Hashable, ttl: float, loader: Callable[[], Awaitable[Any]]) -> Any:
        hit = self._data.get(key)
        if hit and hit[0] > time.monotonic():
            return hit[1]
        lock = self._locks.setdefault(key, asyncio.Lock())
        async with lock:
            # Another waiter may have filled it while we queued.
            hit = self._data.get(key)
            if hit and hit[0] > time.monotonic():
                return hit[1]
            try:
                value = await loader()
            except Exception:
                if hit:  # expired but still held: better stale than an error
                    logger.warning("cache loader failed for %r; serving stale value", key, exc_info=True)
                    return hit[1]
                raise
            finally:
                self._locks.pop(key, None)
            self._evict()
            self._data[key] = (time.monotonic() + ttl, value)
            return value


cache = TTLCache()


async def cached(key: Hashable, ttl: float, loader: Callable[[], Awaitable[Any]]) -> Any:
    """get_or_set on the shared cache, bypassed when CACHE_ENABLED is false."""
    if not settings.cache_enabled:
        return await loader()
    return await cache.get_or_set(key, ttl, loader)
