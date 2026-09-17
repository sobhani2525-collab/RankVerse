"""
Syncs Iranian movies and TV series from TMDb into the entity graph, using
SyncService.bulk_sync_iranian (discover/movie and discover/tv, each queried
separately for origin_country=IR and original_language=fa, deduped by tmdb
id, then synced through the existing sync_movie/sync_tv_series pipeline).

Run from the repo root with the venv active:
    python scripts/sync_iranian_titles.py [pages]

`pages` (default 2) is how many pages of each TMDb discover query to walk --
20 results per page, per query, so pages=2 can pull up to 4 * 2 * 20 = 160
candidate tmdb ids before dedup.

Requires network access to api.themoviedb.org and a valid TMDB_API_KEY in
.env -- this environment's sandboxed tool network couldn't reach TMDb
directly, so this is meant to be run from a normal terminal.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio

from app.core.database import AsyncSessionLocal
from app.modules.sync.service import SyncService


async def main(pages: int) -> None:
    async with AsyncSessionLocal() as db:
        service = SyncService(db)
        synced = await service.bulk_sync_iranian(pages=pages)
        print(f"synced {synced} Iranian title(s) across {pages} page(s) per discover query")


if __name__ == "__main__":
    pages_arg = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    asyncio.run(main(pages_arg))
