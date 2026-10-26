"""
Imports award results from Wikidata for every movie/tv_series/person that has
an imdb_id (see app/modules/sync/awards.py). Safe to re-run any time.

Run from the repo root with the venv active:
    python scripts/sync_awards.py [oscar ...]

Without arguments, every award in SOURCES is imported. The entity_awards
migration must be applied first.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio

from app.core.database import AsyncSessionLocal
from app.modules.sync.awards import SOURCES, import_awards


async def main(keys: list[str]) -> None:
    async with AsyncSessionLocal() as db:
        for key in keys or list(SOURCES):
            stats = await import_awards(db, key)
            print(f"{key}: {stats['fetched']} Wikidata row(s), {stats['matched']} matched to our entities")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
