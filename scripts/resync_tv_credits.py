"""
Re-derives creator/directed_by edges for every existing tv_series from TMDb
(SyncService.resync_tv_series_credits: /tv/{id} with aggregate_credits,
directors filtered by TV_DIRECTOR_MIN_EPISODE_RATIO). Only credits are
touched -- titles, overviews and other attributes are left as they are.

Run from the repo root with the venv active:
    python scripts/resync_tv_credits.py [--dry-run] [delay_seconds]

`delay_seconds` (default 0.3) is the pause between TMDb requests. --dry-run
fetches and filters the same way but writes nothing, printing each series'
current directors next to the new ones instead. A failure
on one series is logged and rolled back without stopping the run. Writes to
whatever DATABASE_URL .env points at.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio

from sqlalchemy import select

from app.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.entities.models import Entity
from app.modules.sync.normalizer import normalize_tv_series
from app.modules.sync.service import SyncService


async def _preview(service: SyncService, series: Entity) -> tuple[list[dict], list[str]]:
    raw = await service.client.get_tv_series(int(series.external_id))
    normalized = normalize_tv_series(
        raw, director_min_episode_ratio=settings.tv_director_min_episode_ratio
    )
    current = [e.to_entity.title for e in await service.repo.get_relationships(series.id, "directed_by")]
    return normalized["directors"], current


async def main(delay: float, dry_run: bool) -> None:
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(Entity.id, Entity.title)
            .where(Entity.entity_type == "tv_series", Entity.external_source == "tmdb")
            .order_by(Entity.title)
        )).all()

        service = SyncService(db)
        with_director: list[tuple[str, list[dict]]] = []
        without_director: list[str] = []
        failed: list[tuple[str, str]] = []

        print(f"{'DRY RUN: ' if dry_run else ''}re-syncing credits for {len(rows)} tv series "
              f"(min episode ratio {settings.tv_director_min_episode_ratio})")
        for i, (series_id, title) in enumerate(rows, 1):
            try:
                series = await db.get(Entity, series_id)
                if dry_run:
                    directors, current = await _preview(service, series)
                else:
                    directors = await service.resync_tv_series_credits(series)
            except Exception as e:
                await db.rollback()
                failed.append((title, repr(e)))
                print(f"[{i}/{len(rows)}] {title}: FAILED {e!r}")
            else:
                if directors:
                    with_director.append((title, directors))
                else:
                    without_director.append(title)
                names = ", ".join(
                    f"{d['name']} ({d['episode_count']})" if d["episode_count"] is not None else d["name"]
                    for d in directors
                ) or "-"
                was = f"  (was: {', '.join(current) or '-'})" if dry_run else ""
                print(f"[{i}/{len(rows)}] {title}: {names}{was}")
            await asyncio.sleep(delay)

    print()
    print(f"processed: {len(rows)}")
    print(f"with director: {len(with_director)}")
    print(f"without director: {len(without_director)}")
    for title in without_director:
        print(f"  - {title}")
    print(f"failed: {len(failed)}")
    for title, err in failed:
        print(f"  - {title}: {err}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--dry-run"]
    delay_arg = float(args[0]) if args else 0.3
    asyncio.run(main(delay_arg, dry_run="--dry-run" in sys.argv[1:]))
