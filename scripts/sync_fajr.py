"""
Imports Fajr Film Festival results (Crystal Simorgh) from Persian Wikipedia
(see app/modules/sync/fajr.py). Safe to re-run any time.

Run from the repo root with the venv active:
    python scripts/sync_fajr.py

Prints a summary and the rows that could not be matched to our entities.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio

from app.core.database import AsyncSessionLocal
from app.modules.sync.fajr import import_fajr


async def main() -> None:
    async with AsyncSessionLocal() as db:
        stats = await import_fajr(db)
    for line in stats["unmatched"][:60]:
        print("unmatched:", line)
    print(f"fajr: {stats['rows']} row(s), {stats['matched']} award(s) matched, {len(stats['unmatched'])} unmatched")


if __name__ == "__main__":
    asyncio.run(main())
