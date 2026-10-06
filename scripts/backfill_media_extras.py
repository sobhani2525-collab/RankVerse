"""
Fills in two display-only attributes for existing movies / tv series from
TMDb: attributes["trailer_key"] (YouTube) and attributes["more_cast"] (billed
cast beyond the 5 linked actors). Nothing else is touched: no edges, no
people, no titles/overviews/ratings. New syncs already write both (see
normalizer.media_extras); this is for titles synced before that.

Run from the repo root with the venv active:
    python scripts/backfill_media_extras.py [--type movie|tv_series] [--limit N] [--dry-run] [--delay S] [--prod]

--prod runs against BULK_DATABASE_URL (the production transaction pooler, one
sequential connection, so it doesn't starve the live site's pool); without it
the script uses DATABASE_URL, i.e. whatever .env points at locally.

Titles are taken best-ranked first, skipping any that already have a
trailer_key or more_cast, so it can be re-run (or stopped and resumed) and
`--limit 2000` fills the pages people actually visit. --dry-run fetches but
writes nothing. A failure on one title is logged and skipped.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import asyncio

from sqlalchemy import select

from app.core.database import AsyncSessionLocal, make_bulk_sessionmaker
from app.modules.entities.models import Entity, EntityRanking
from app.modules.sync.normalizer import media_extras
from app.modules.sync.tmdb_client import TMDbClient


async def main(entity_type: str, limit: int, delay: float, dry_run: bool, prod: bool) -> None:
    client = TMDbClient()
    session_factory = make_bulk_sessionmaker() if prod else AsyncSessionLocal
    async with session_factory() as db:
        rows = (await db.execute(
            select(Entity.id, Entity.title, Entity.external_id)
            .outerjoin(EntityRanking, EntityRanking.entity_id == Entity.id)
            .where(
                Entity.entity_type == entity_type,
                Entity.external_source == "tmdb",
                Entity.external_id.is_not(None),
                ~Entity.attributes.has_key("trailer_key"),
                ~Entity.attributes.has_key("more_cast"),
            )
            .order_by(EntityRanking.computed_score.desc().nulls_last(), Entity.id)
            .limit(limit)
        )).all()

        print(f"{'DRY RUN: ' if dry_run else ''}{len(rows)} {entity_type} titles to backfill")
        updated = empty = failed = 0
        for i, (entity_id, title, external_id) in enumerate(rows, 1):
            try:
                raw = await (client.get_movie if entity_type == "movie" else client.get_tv_series)(int(external_id))
                extras = media_extras(raw)
                if not extras:
                    # Mark as done so reruns don't refetch titles TMDb has nothing for.
                    extras = {"more_cast": []}
                    empty += 1
                if not dry_run:
                    entity = await db.get(Entity, entity_id)
                    entity.attributes = {**(entity.attributes or {}), **extras}
                    await db.commit()
                updated += 1
                if i % 50 == 0 or dry_run:
                    print(f"[{i}/{len(rows)}] {title}: trailer={'yes' if 'trailer_key' in extras else 'no'}, "
                          f"more_cast={len(extras.get('more_cast', []))}")
            except Exception as e:
                await db.rollback()
                failed += 1
                print(f"[{i}/{len(rows)}] {title}: FAILED {e!r}")
            await asyncio.sleep(delay)

        print(f"done: {updated} processed ({empty} with nothing from TMDb), {failed} failed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--type", choices=["movie", "tv_series"], default="movie")
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--delay", type=float, default=0.3)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--prod", action="store_true", help="use BULK_DATABASE_URL (production)")
    args = parser.parse_args()
    asyncio.run(main(args.type, args.limit, args.delay, args.dry_run, args.prod))
