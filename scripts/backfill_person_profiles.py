"""
Backfills photos and biographies for person entities from TMDb.

People are created as a side effect of syncing a movie/series, and until
the sync started keeping each credit's profile_path they were all stored
with empty attributes -- no photo, no biography. This fetches
/person/{id}?append_to_response=translations for each TMDb person (one
request covers the photo and the English + Persian biography) and merges
the result into attributes (normalizer.person_backfill_attrs).

Run from the repo root with the venv active:
    python scripts/backfill_person_profiles.py [--dry-run] [--limit N] [--workers 16] [--batch 200]

Resumable: every person processed gets attributes["profile_checked_at"]
(also when TMDb has no photo, or the person 404s), and only people
without it are selected, so an interrupted run can just be started again.
--dry-run fetches --limit people (default 20) and prints what would be
written, writing nothing.

TMDb requests run in --workers concurrent tasks (TMDb allows ~50 req/s;
the client retries 429s and connect timeouts). A separate writer task
flushes results in batches of --batch -- one set-based UPDATE per batch,
through a single connection via make_bulk_sessionmaker (BULK_DATABASE_URL)
-- so fetching never waits on the database and the live site's connection
pool isn't touched. Writes to the DB .env points at.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import asyncio
import json
import time
from datetime import datetime, timezone

import httpx
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError

from app.core.database import make_bulk_sessionmaker
from app.modules.entities.models import Entity
from app.modules.sync.normalizer import person_backfill_attrs
from app.modules.sync.tmdb_client import TMDbClient

CHECKED_KEY = "profile_checked_at"

AsyncSessionLocal = make_bulk_sessionmaker()


async def load_todo(limit: int | None) -> list[tuple]:
    async with AsyncSessionLocal() as db:
        stmt = (
            select(Entity.id, Entity.external_id, Entity.title)
            .where(
                Entity.entity_type == "person",
                Entity.external_source == "tmdb_person",
                ~Entity.attributes.has_key(CHECKED_KEY),
            )
            .order_by(Entity.id)
        )
        if limit:
            stmt = stmt.limit(limit)
        return (await db.execute(stmt)).all()


async def fetch_all(todo: list[tuple], workers: int, on_result) -> None:
    """Fetches each person from TMDb; calls on_result(entity_id, title, attrs | None, error | None)."""
    client = TMDbClient()
    queue: asyncio.Queue = asyncio.Queue()
    for row in todo:
        queue.put_nowait(row)

    async def worker():
        while True:
            try:
                entity_id, external_id, title = queue.get_nowait()
            except asyncio.QueueEmpty:
                return
            try:
                raw = await client.get_person(int(external_id))
                await on_result(entity_id, title, person_backfill_attrs(raw), None)
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    # Gone from TMDb -- mark it checked so it isn't retried forever.
                    await on_result(entity_id, title, {}, None)
                else:
                    await on_result(entity_id, title, None, repr(e))
            except Exception as e:  # noqa: BLE001 -- one bad person mustn't stop the run
                await on_result(entity_id, title, None, repr(e))

    await asyncio.gather(*(worker() for _ in range(workers)))


# One round trip per batch: the ids/attributes arrive as two parallel
# arrays (attributes as JSON text, cast here) instead of one UPDATE per row.
WRITE_BATCH_SQL = text(
    """
    UPDATE entities AS e
    SET attributes = e.attributes || v.attrs::jsonb
    FROM unnest(CAST(:ids AS uuid[]), CAST(:attrs AS text[])) AS v(id, attrs)
    WHERE e.id = v.id
    """
)


WRITE_ATTEMPTS = 3


async def write_batch(batch: list[tuple]) -> None:
    """
    batch: [(entity_id, attrs dict), ...]. Retries transient connection
    failures (e.g. a DNS blip resolving the pooler host); the UPDATE is a
    plain merge, so re-running it after a failed attempt is harmless.
    """
    if not batch:
        return
    params = {"ids": [entity_id for entity_id, _ in batch], "attrs": [json.dumps(a, ensure_ascii=False) for _, a in batch]}
    for attempt in range(1, WRITE_ATTEMPTS + 1):
        try:
            async with AsyncSessionLocal() as db:
                await db.execute(WRITE_BATCH_SQL, params)
                await db.commit()
            return
        except (OSError, SQLAlchemyError):
            if attempt == WRITE_ATTEMPTS:
                raise
            await asyncio.sleep(3 * attempt)


async def main(dry_run: bool, limit: int | None, workers: int, batch_size: int) -> None:
    if dry_run and not limit:
        limit = 20
    todo = await load_todo(limit)
    print(f"{'DRY RUN: ' if dry_run else ''}{len(todo)} people to check", flush=True)
    if not todo:
        return

    stats = {"done": 0, "photo": 0, "bio": 0, "failed": 0, "written": 0, "write_failed": 0}
    started = time.time()
    results: asyncio.Queue = asyncio.Queue()
    DONE = object()

    async def writer():
        """Drains results into batches; flushes when full or after 5s idle."""
        batch: list[tuple] = []
        finished = False
        while not finished:
            try:
                item = await asyncio.wait_for(results.get(), timeout=5)
            except asyncio.TimeoutError:
                item = None
            if item is DONE:
                finished = True
            elif item is not None:
                batch.append(item)
            if batch and (finished or item is None or len(batch) >= batch_size):
                try:
                    await write_batch(batch)
                    stats["written"] += len(batch)
                except Exception as e:  # noqa: BLE001 -- unwritten people stay unchecked; a re-run retries them
                    stats["write_failed"] += len(batch)
                    print(f"  batch write failed ({len(batch)} people, will be retried on the next run): {e!r}", flush=True)
                batch = []
                elapsed = time.time() - started
                print(f"  {stats['written']}/{len(todo)} written ({stats['photo']} photos, {stats['bio']} bios, "
                      f"{stats['failed']} failed) -- {stats['written'] / elapsed:.1f}/s", flush=True)

    async def on_result(entity_id, title, attrs, error):
        if error is not None:
            stats["failed"] += 1
            print(f"  failed: {title}: {error}", flush=True)
            return
        stats["done"] += 1
        stats["photo"] += "media" in attrs
        stats["bio"] += "biography" in attrs
        if dry_run:
            print(f"  {title}: photo={attrs.get('media', {}).get('image_url')} "
                  f"bio={attrs.get('biography_source')} ({len(attrs.get('biography') or '')} chars)", flush=True)
            return
        results.put_nowait((entity_id, {**attrs, CHECKED_KEY: datetime.now(timezone.utc).isoformat()}))

    writer_task = None if dry_run else asyncio.create_task(writer())
    await fetch_all(todo, workers, on_result)
    if writer_task:
        results.put_nowait(DONE)
        await writer_task

    print(f"{'DRY RUN: ' if dry_run else ''}checked {stats['done']} people: {stats['photo']} with photo, "
          f"{stats['bio']} with biography, {stats['failed']} fetch failed, {stats['write_failed']} write failed "
          f"(re-run to retry those) "
          f"in {time.time() - started:.0f}s", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument("--batch", type=int, default=200)
    args = parser.parse_args()
    asyncio.run(main(args.dry_run, args.limit, args.workers, args.batch))
