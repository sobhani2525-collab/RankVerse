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
        self._refreshing: set[Hashable] = set()
        self._tasks: set[asyncio.Task] = set()

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

    def _refresh_in_background(self, key: Hashable, ttl: float, loader: Callable[[], Awaitable[Any]]) -> None:
        if key in self._refreshing:
            return
        self._refreshing.add(key)

        async def run() -> None:
            try:
                value = await loader()
                self._evict()
                self._data[key] = (time.monotonic() + ttl, value)
            except Exception:
                logger.warning("background refresh failed for %r; keeping stale value", key, exc_info=True)
                old = self._data.get(key)
                if old:  # don't hammer a struggling DB: retry in a bit
                    self._data[key] = (time.monotonic() + min(30.0, ttl), old[1])
            finally:
                self._refreshing.discard(key)

        task = asyncio.create_task(run())
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def get_or_set(
        self, key: Hashable, ttl: float, loader: Callable[[], Awaitable[Any]], stale_for: float = 0
    ) -> Any:
        """Cached value for key, loading it on a miss. With stale_for, a value
        up to that many seconds past its TTL is served immediately while one
        background task refreshes it, so nobody waits on the slow load after
        the first. The loader must then not depend on any request-scoped
        resource (it may run after the request has finished)."""
        hit = self._data.get(key)
        now = time.monotonic()
        if hit and hit[0] > now:
            return hit[1]
        if hit and stale_for and now < hit[0] + stale_for:
            self._refresh_in_background(key, ttl, loader)
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


async def cached(key: Hashable, ttl: float, loader: Callable[[], Awaitable[Any]], stale_for: float = 0) -> Any:
    """get_or_set on the shared cache, bypassed when CACHE_ENABLED is false."""
    if not settings.cache_enabled:
        return await loader()
    return await cache.get_or_set(key, ttl, loader, stale_for)
