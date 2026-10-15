"""
How much is left to machine-translate, using the same selection as
scripts/translate_overviews.py (so obscure Asian/Arabic/Turkish titles are
already excluded). Read-only.

Run from the repo root with the venv active:
    python scripts/translation_stats.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio
from collections import Counter

from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.modules.sync.translation import english_source, is_low_priority, is_persian, titles_needing_translation


async def main() -> None:
    async with AsyncSessionLocal() as db:
        todo = await titles_needing_translation(db)
        rows = (
            await db.execute(
                text("SELECT entity_type, attributes FROM entities WHERE entity_type IN ('movie', 'tv_series')")
            )
        ).all()
        persons = (
            await db.execute(
                text(
                    "SELECT count(*) FILTER (WHERE attributes->>'biography_source' = 'en'), count(*) "
                    "FROM entities WHERE entity_type = 'person'"
                )
            )
        ).one()

    skipped = Counter()
    sources = Counter()
    for entity_type, attrs in rows:
        attrs = attrs or {}
        sources[(entity_type, attrs.get("overview_source") or "none")] += 1
        if english_source(attrs) and is_low_priority(attrs):
            skipped[entity_type] += 1

    by_type = Counter(i["entity_type"] for i in todo)
    chars = sum(len(i["source"]) for i in todo)
    print("To translate (movies/series, obscure Asian/Arabic/Turkish titles excluded):")
    print(f"  movies : {by_type['movie']:,}")
    print(f"  series : {by_type['tv_series']:,}")
    print(f"  total  : {len(todo):,}  (~{chars:,} English characters, ~{chars // 4:,} input tokens)")
    print("Skipped as obscure (not translated):")
    print(f"  movies : {skipped['movie']:,}   series : {skipped['tv_series']:,}")
    print("Current overview sources (tmdb_fa / machine / manual / en / none):")
    for (entity_type, source), n in sorted(sources.items()):
        print(f"  {entity_type:10} {source:8} {n:,}")
    print(f"People with an English-only biography: {persons[0]:,} of {persons[1]:,}")
    print("(there is no biography translation step yet; this is only a count)")


if __name__ == "__main__":
    asyncio.run(main())
