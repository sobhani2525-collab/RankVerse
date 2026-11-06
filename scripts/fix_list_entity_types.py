"""
One-off repair: fills user_lists.entity_type for lists where it is NULL, using the
majority entity type of their items (so the type filter and card label work).
Run from the repo root with the venv active:
    python scripts/fix_list_entity_types.py          # dry run
    python scripts/fix_list_entity_types.py --apply
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import asyncio

from sqlalchemy import text

from app.core.database import AsyncSessionLocal

QUERY = """
SELECT l.id, l.slug, t.entity_type, t.n FROM user_lists l
JOIN LATERAL (
  SELECT e.entity_type, count(*) AS n FROM user_list_items i JOIN entities e ON e.id = i.entity_id
  WHERE i.list_id = l.id GROUP BY e.entity_type ORDER BY n DESC, e.entity_type LIMIT 1
) t ON true
WHERE l.entity_type IS NULL AND l.is_watch_later = false
"""


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(text(QUERY))).all()
        for r in rows:
            print(f"{r.slug}: {r.entity_type} ({r.n} items)")
        print(f"{len(rows)} lists")
        if args.apply:
            for r in rows:
                await db.execute(text("UPDATE user_lists SET entity_type = :t WHERE id = :i"), {"t": r.entity_type, "i": r.id})
            await db.commit()
            print("applied")


asyncio.run(main())
