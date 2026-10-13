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


async def test_stale_while_revalidate_serves_stale_and_refreshes_once():
    c = TTLCache()
    n = 0

    async def loader():
        nonlocal n
        n += 1
        await asyncio.sleep(0.05)
        return n

    assert await c.get_or_set("k", 0.01, loader, stale_for=60) == 1  # cold: blocks
    await asyncio.sleep(0.03)  # expired, inside the stale window
    started = asyncio.get_running_loop().time()
    results = [await c.get_or_set("k", 0.01, loader, stale_for=60) for _ in range(5)]
    assert results == [1] * 5  # nobody waited for the reload
    assert asyncio.get_running_loop().time() - started < 0.04
    await asyncio.sleep(0.12)
    assert n == 2  # exactly one background refresh for five stale reads
    assert c._data["k"][1] == 2


async def test_stale_refresh_failure_keeps_serving_stale():
    c = TTLCache()
    calls = 0

    async def loader():
        nonlocal calls
        calls += 1
        if calls > 1:
            raise RuntimeError("db down")
        return "old"

    await c.get_or_set("k", 0.01, loader, stale_for=60)
    await asyncio.sleep(0.03)
    assert await c.get_or_set("k", 0.01, loader, stale_for=60) == "old"
    await asyncio.sleep(0.05)
    assert await c.get_or_set("k", 0.01, loader, stale_for=60) == "old"


async def test_discover_endpoint_is_cached_but_searches_are_not(client, monkeypatch):
    from app.modules.lists.service import ListService

    calls = 0
    orig = ListService.discover

    async def counting(self, *a, **kw):
        nonlocal calls
        calls += 1
        return await orig(self, *a, **kw)

    monkeypatch.setattr(ListService, "discover", counting)
    await client.get("/api/v1/lists")
    await client.get("/api/v1/lists")
    assert calls == 1
    await client.get("/api/v1/lists?q=abc")
    await client.get("/api/v1/lists?q=abc")
    assert calls == 3


async def test_related_endpoint_is_cached(client, db_session, monkeypatch):
    from app.modules.entities.repository import EntityRepository

    movie = await EntityRepository(db_session).create_entity(
        entity_type="movie", external_id=None, external_source=None, title="R", slug="r", attributes={}
    )
    await db_session.commit()

    calls = 0
    orig = EntityRepository.get_related

    async def counting(self, *a, **kw):
        nonlocal calls
        calls += 1
        return await orig(self, *a, **kw)

    monkeypatch.setattr(EntityRepository, "get_related", counting)
    for _ in range(3):
        assert (await client.get(f"/api/v1/entities/{movie.id}/related")).status_code == 200
    assert calls == 1
    assert (await client.get("/api/v1/entities/00000000-0000-0000-0000-000000000000/related")).status_code == 404


async def test_sitemap_counts_endpoint_is_cached(client, monkeypatch):
    from app.modules.entities.repository import EntityRepository

    calls = 0
    orig = EntityRepository.sitemap_counts

    async def counting(self, types):
        nonlocal calls
        calls += 1
        return await orig(self, types)

    monkeypatch.setattr(EntityRepository, "sitemap_counts", counting)
    r1 = await client.get("/api/v1/sitemap/entities/counts")
    r2 = await client.get("/api/v1/sitemap/entities/counts")
    assert r1.status_code == 200 and r1.json() == r2.json() and calls == 1
