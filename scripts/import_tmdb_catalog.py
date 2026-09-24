"""
Imports TMDb's non-Farsi movie and/or TV catalog above a vote-count floor
into the entity graph, through the same SyncService.sync_movie /
sync_tv_series pipeline the single-title sync endpoints use (so each
title gets its fa-IR overview/title where TMDb has one, imdb_id,
directors/cast/genres, and -- movies only -- a ranking row).

Run from the repo root with the venv active:
    python scripts/import_tmdb_catalog.py [--kind movie|tv|all] [--min-votes 100]
                                          [--imdb-above 5] [--tv-imdb-above 7]
                                          [--workers 6] [--limit N]
    python scripts/import_tmdb_catalog.py --existing   # re-sync titles already in the DB

Only movies rated above --imdb-above on IMDb (default 5, strictly
greater) and series rated above --tv-imdb-above (default 7) are imported -- checked against IMDb's ratings dataset right
after the TMDb fetch, before anything is written (see
imdb_ratings.rating_above; a title with no IMDb rating falls back to its
TMDb score). Skipped titles are simply fetched and re-checked again on
the next run.

Set BULK_DATABASE_URL (see .env.example) to run with many workers;
without it the worker count is capped so the live site keeps its DB
connections.

Resumable: titles already in the DB are skipped (the default run only
inserts new ones), so an interrupted run can just be started again.
--existing instead re-syncs the tmdb movies/tv_series synced before
imdb_id/overview_en/overview_source existed, to backfill those fields; machine translations and IMDb ratings survive a re-sync
(see sync.service._merge_preserved_attributes).

Follow-up steps once titles are in:
    python scripts/translate_overviews.py   # Persian overview for the rest
    python scripts/sync_imdb_ratings.py     # IMDb rating/votes
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import asyncio
import logging
import tempfile
import time
from typing import Callable

from sqlalchemy import select

from app.config import settings
from app.core.database import make_bulk_sessionmaker
from app.modules.entities.models import Entity
from app.modules.sync.catalog import discover_catalog_ids
from app.modules.sync.imdb_ratings import download_ratings, load_ratings, rating_above
from app.modules.sync.service import SyncService

logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("import_tmdb_catalog")

ENTITY_TYPE = {"movie": "movie", "tv": "tv_series"}

# Without BULK_DATABASE_URL every worker holds a connection on the same
# 15-client session pooler the live backend uses (see
# make_bulk_sessionmaker), so keep well clear of that cap.
MAX_WORKERS_ON_SHARED_POOL = 4

AsyncSessionLocal = make_bulk_sessionmaker()

# A single title normally syncs in seconds; anything past this is a hung
# network call, so it's abandoned (and retried once) rather than stalling
# its worker for good.
TITLE_TIMEOUT_SECONDS = 300


async def existing_tmdb_ids(entity_type: str, legacy_only: bool = False) -> set[int]:
    """tmdb ids of this type already in the DB; legacy_only narrows it to
    titles synced before overview_source/imdb_id existed."""
    async with AsyncSessionLocal() as db:
        stmt = select(Entity.external_id).where(Entity.external_source == "tmdb", Entity.entity_type == entity_type)
        if legacy_only:
            stmt = stmt.where(~Entity.attributes.has_key("overview_source"))
        rows = await db.execute(stmt)
        return {int(x) for x in rows.scalars() if x and x.isdigit()}


async def _close_quietly(db) -> None:
    try:
        await asyncio.wait_for(db.close(), 30)
    except Exception:
        pass


async def _reset_session(db):
    """
    Roll back after a failed title. If even the rollback fails or hangs
    (the connection died -- e.g. the network dropped), throw the session
    away and hand the worker a fresh one instead of retrying on a dead
    connection forever.
    """
    try:
        await asyncio.wait_for(db.rollback(), 30)
        return db
    except Exception:
        await _close_quietly(db)
        return AsyncSessionLocal()


def keep_system_awake() -> None:
    """
    Ask Windows not to idle-sleep while this process runs (a per-process
    request released when it exits, not a change to power settings) -- a
    sleeping machine drops every connection mid-import.
    """
    if sys.platform == "win32":
        import ctypes

        ES_CONTINUOUS, ES_SYSTEM_REQUIRED = 0x80000000, 0x00000001
        ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)


async def sync_all(
    kind: str, tmdb_ids: list[int], workers: int, accept: Callable[[dict], bool] | None = None
) -> tuple[int, int, list[int]]:
    """
    Worker pool, one DB session per worker. A failed or timed-out title is
    rolled back and retried once -- the likely causes are two workers
    creating the same person/genre at the same moment (slug unique
    constraint), which the retry resolves by finding the now-existing row,
    or a dropped connection, which _reset_session replaces.
    """
    queue: asyncio.Queue[int] = asyncio.Queue()
    for tmdb_id in tmdb_ids:
        queue.put_nowait(tmdb_id)
    done = skipped = 0
    failed: list[int] = []
    started = time.monotonic()

    async def worker() -> None:
        nonlocal done, skipped
        db = AsyncSessionLocal()
        service = SyncService(db)
        try:
            while True:
                try:
                    tmdb_id = queue.get_nowait()
                except asyncio.QueueEmpty:
                    return
                for attempt in (1, 2):
                    if service.db is not db:
                        service = SyncService(db)
                    sync = service.sync_movie if kind == "movie" else service.sync_tv_series
                    try:
                        result = await asyncio.wait_for(sync(tmdb_id, accept=accept), TITLE_TIMEOUT_SECONDS)
                        if result is None:
                            skipped += 1
                        else:
                            done += 1
                        break
                    except Exception:
                        db = await _reset_session(db)
                        if attempt == 2:
                            logger.exception("giving up on %s %s", kind, tmdb_id)
                            failed.append(tmdb_id)
                        else:
                            await asyncio.sleep(5)
                processed = done + skipped + len(failed)
                if processed % 100 == 0:
                    rate = processed / max(time.monotonic() - started, 1e-9)
                    remaining = (len(tmdb_ids) - processed) / rate if rate else 0
                    print(
                        f"[{kind}] {processed}/{len(tmdb_ids)} "
                        f"({skipped} skipped, {len(failed)} failed, {rate:.1f}/s, ~{remaining / 60:.0f} min left)",
                        flush=True,
                    )
        finally:
            await _close_quietly(db)

    await asyncio.gather(*(worker() for _ in range(workers)))
    return done, skipped, failed


async def run(
    kind: str, min_votes: int, workers: int, limit: int | None, existing: bool, accept: Callable[[dict], bool] | None
) -> None:
    entity_type = ENTITY_TYPE[kind]
    have = await existing_tmdb_ids(entity_type)

    if existing:
        todo = sorted(await existing_tmdb_ids(entity_type, legacy_only=True))
        print(f"[{kind}] re-syncing {len(todo)} existing title(s)", flush=True)
    else:
        print(f"[{kind}] discovering TMDb titles with >= {min_votes} votes...", flush=True)
        catalog = await discover_catalog_ids(kind, min_votes)
        # Most-voted first, so a partial run has imported the titles people
        # are most likely to look for.
        todo = [
            tmdb_id
            for tmdb_id, info in sorted(catalog.items(), key=lambda kv: -(kv[1]["vote_count"] or 0))
            if tmdb_id not in have
        ]
        print(
            f"[{kind}] {len(catalog)} non-Farsi title(s) on TMDb, {len(catalog) - len(todo)} already imported, "
            f"{len(todo)} to import",
            flush=True,
        )

    if limit is not None:
        todo = todo[:limit]
    # --existing re-syncs what's already there; the rating floor only
    # gates new imports (it never removes a title).
    done, skipped, failed = await sync_all(kind, todo, workers, accept=None if existing else accept)
    print(f"[{kind}] synced {done}, skipped {skipped} (IMDb rating floor), failed {len(failed)}", flush=True)
    if failed:
        print(f"[{kind}] failed tmdb ids: {failed}", flush=True)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--kind", choices=["movie", "tv", "all"], default="all")
    parser.add_argument("--min-votes", type=int, default=100)
    parser.add_argument(
        "--imdb-above", type=float, default=5.0,
        help="only import movies rated strictly above this on IMDb (default 5; pass -1 to disable)",
    )
    parser.add_argument(
        "--tv-imdb-above", type=float, default=7.0,
        help="the same floor for TV series (default 7; pass -1 to disable)",
    )
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--limit", type=int, default=None, help="only sync the first N titles per kind (for a trial run)")
    parser.add_argument("--existing", action="store_true", help="re-sync titles synced before imdb_id/overview_source existed, instead of importing new ones")
    args = parser.parse_args()
    keep_system_awake()

    if not settings.bulk_database_url and args.workers > MAX_WORKERS_ON_SHARED_POOL:
        print(
            f"BULK_DATABASE_URL is not set -- limiting to {MAX_WORKERS_ON_SHARED_POOL} workers so the "
            f"import doesn't exhaust the connection pool the live site shares",
            flush=True,
        )
        args.workers = MAX_WORKERS_ON_SHARED_POOL

    kinds = ["movie", "tv"] if args.kind == "all" else [args.kind]
    floors = {"movie": args.imdb_above, "tv": args.tv_imdb_above}
    accepts: dict[str, Callable[[dict], bool] | None] = {kind: None for kind in kinds}
    if not args.existing and any(floors[kind] >= 0 for kind in kinds):
        with tempfile.TemporaryDirectory() as tmp:
            print("downloading IMDb ratings dataset for the rating floor...", flush=True)
            ratings = load_ratings(await download_ratings(Path(tmp) / "title.ratings.tsv.gz"))
        print(f"loaded {len(ratings):,} IMDb ratings", flush=True)
        for kind in kinds:
            if floors[kind] >= 0:
                print(f"[{kind}] importing titles rated above {floors[kind]} on IMDb", flush=True)
                accepts[kind] = rating_above(ratings, floors[kind])

    for kind in kinds:
        await run(kind, args.min_votes, args.workers, args.limit, args.existing, accepts[kind])


if __name__ == "__main__":
    asyncio.run(main())
