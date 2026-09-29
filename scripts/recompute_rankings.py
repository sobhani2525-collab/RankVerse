"""
Recomputes EntityRanking.computed_score for every movie/tv_series, in
batches, holding a single session-pooler connection at a time (briefly,
per batch) instead of looping the /internal/rankings/recompute endpoint
one entity at a time over HTTP -- that endpoint times out long before
finishing a catalog this size, and while it's stuck it holds the
connection for the whole run instead of just a batch at a time.
BULK_DATABASE_URL's transaction-mode pooler was tried first but hung on
the ORM's batched UPDATE (executemany with a fresh prepared-statement
name per call doesn't play well with PgBouncer transaction pooling);
the regular session-pooler connection handles it fine and one script
holding it for a few hundred ms per batch is not a meaningful load.

Needed once after app/modules/ranking/service.py's blend_with_external fix
(2026-09-28): every existing computed_score was computed with the old,
unscaled formula and needs a fresh value.

Run from the repo root with the venv active:
    python scripts/recompute_rankings.py [--batch-size 200] [--entity-type movie]
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import asyncio
import time

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.modules.entities.models import Entity
from app.modules.ranking.service import RankingService


async def recompute_type(sessionmaker, entity_type: str, batch_size: int) -> int:
    async with sessionmaker() as db:
        ids = (
            await db.execute(select(Entity.id).where(Entity.entity_type == entity_type))
        ).scalars().all()

    total = len(ids)
    print(f"{entity_type}: {total} entities")
    done = 0
    start = time.monotonic()

    for i in range(0, total, batch_size):
        chunk_ids = ids[i : i + batch_size]
        async with sessionmaker() as db:
            entities = (
                await db.execute(select(Entity).where(Entity.id.in_(chunk_ids)))
            ).scalars().all()
            await RankingService(db).recompute_entities(entities)
            await db.commit()

        done += len(chunk_ids)
        elapsed = time.monotonic() - start
        print(f"  {done}/{total} ({elapsed:.1f}s)")

    return total


async def main(entity_types: list[str], batch_size: int) -> None:
    for entity_type in entity_types:
        await recompute_type(AsyncSessionLocal, entity_type, batch_size)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=200)
    parser.add_argument("--entity-type", action="append", dest="entity_types")
    args = parser.parse_args()
    asyncio.run(main(args.entity_types or ["movie", "tv_series"], args.batch_size))
