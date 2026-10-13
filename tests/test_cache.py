import asyncio

import pytest

from app.core.cache import TTLCache, cached
from app.config import settings


async def test_hit_and_miss():
    c = TTLCache()
    calls = []

    async def loader():
        calls.append(1)
        return {"v": len(calls)}

    assert await c.get_or_set("k", 60, loader) == {"v": 1}
    assert await c.get_or_set("k", 60, loader) == {"v": 1}
    assert await c.get_or_set("other", 60, loader) == {"v": 2}
    assert len(calls) == 2


async def test_expiry_reloads():
    c = TTLCache()
    n = 0

    async def loader():
        nonlocal n
        n += 1
        return n

    assert await c.get_or_set("k", 0.01, loader) == 1
    await asyncio.sleep(0.03)
    assert await c.get_or_set("k", 0.01, loader) == 2


async def test_stampede_loads_once():
    c = TTLCache()
    calls = 0

    async def loader():
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.05)
        return "x"

    results = await asyncio.gather(*(c.get_or_set("k", 60, loader) for _ in range(20)))
    assert results == ["x"] * 20
    assert calls == 1


async def test_stale_on_error_and_raise_when_cold():
    c = TTLCache()

    async def good():
        return "old"

    async def bad():
        raise RuntimeError("db down")

    with pytest.raises(RuntimeError):
        await c.get_or_set("k", 0.01, bad)
    await c.get_or_set("k", 0.01, good)
    await asyncio.sleep(0.03)
    assert await c.get_or_set("k", 0.01, bad) == "old"


async def test_max_entries_cap():
    c = TTLCache(max_entries=3)

    async def loader():
        return 1

    for i in range(10):
        await c.get_or_set(i, 60, loader)
    assert len(c._data) <= 3


async def test_disabled_flag_bypasses_cache(monkeypatch):
    monkeypatch.setattr(settings, "cache_enabled", False)
    n = 0

    async def loader():
        nonlocal n
        n += 1
        return n

    assert await cached("k", 60, loader) == 1
    assert await cached("k", 60, loader) == 2


async def test_endpoint_is_cached(client, monkeypatch):
    from app.modules.lists.service import ListService

    calls = 0
    orig = ListService.featured

    async def counting(self, limit):
        nonlocal calls
        calls += 1
        return await orig(self, limit)

    monkeypatch.setattr(ListService, "featured", counting)
    r1 = await client.get("/api/v1/lists/featured")
    r2 = await client.get("/api/v1/lists/featured")
    assert r1.status_code == 200 and r1.json() == r2.json()
    assert calls == 1
    await client.get("/api/v1/lists/featured?limit=2")
    assert calls == 2  # query params are part of the key
