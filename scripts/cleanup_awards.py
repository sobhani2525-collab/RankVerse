"""
One-off cleanup of award rows imported before sync/awards.py started filtering
them: out-of-range years (bad Wikidata dates), a title's "for work" pointing at
a different title, and a title that is "for" itself. Safe to re-run any time;
it changes nothing when there is nothing to clean.

Run from the repo root with the venv active:
    python scripts/cleanup_awards.py
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio

from sqlalchemy import text

from app.core.database import AsyncSessionLocal

STEPS = [
    ("out-of-range years", "delete from entity_awards where year < 1927 or year > 2027"),
    (
        "title awards 'for' another title",
        "delete from entity_awards a using entities e where e.id = a.entity_id and e.entity_type <> 'person' "
        "and a.for_entity_id is not null and a.for_entity_id <> a.entity_id",
    ),
    (
        "duplicate self-references",
        "delete from entity_awards a where a.for_entity_id = a.entity_id and exists (select 1 from entity_awards b "
        "where b.entity_id = a.entity_id and b.award = a.award and b.category = a.category and b.year = a.year "
        "and b.for_entity_id is null)",
    ),
    ("self-references", "update entity_awards set for_entity_id = null where for_entity_id = entity_id"),
]


async def main() -> None:
    async with AsyncSessionLocal() as db:
        for label, sql in STEPS:
            print(f"{label}: {(await db.execute(text(sql))).rowcount} row(s)")
        await db.commit()
        print("total awards:", (await db.execute(text("select count(*) from entity_awards"))).scalar())


if __name__ == "__main__":
    asyncio.run(main())
