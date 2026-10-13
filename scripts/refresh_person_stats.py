"""
Rebuilds the person_stats table that /rankings/people reads (see
app/modules/entities/person_stats.py). Run after catalog syncs or ranking
recomputes, or on a schedule; the people ranking serves the last build until
then. Until the first run the endpoint falls back to the live aggregation.

Run from the repo root with the venv active:
    python scripts/refresh_person_stats.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio
import time

from app.core.database import AsyncSessionLocal
from app.modules.entities.person_stats import refresh_person_stats


async def main() -> None:
    start = time.monotonic()
    async with AsyncSessionLocal() as db:
        rows = await refresh_person_stats(db)
    if rows is None:
        print("another process is already rebuilding person_stats; nothing to do")
        return
    print(f"person_stats rebuilt: {rows} rows in {time.monotonic() - start:.1f}s")


if __name__ == "__main__":
    asyncio.run(main())
