"""
One-off repair: strips the echoed request header ("فیلم: Title (2017)" plus a
"خلاصه داستان:" label, or "شخص: Name" plus "زندگینامه:") that some models put
in front of machine translations. Run from the repo root with the venv active:
    python scripts/fix_translation_headers.py          # dry run, prints counts
    python scripts/fix_translation_headers.py --apply
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import asyncio
import json

from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.modules.sync.translation import is_persian, strip_prompt_echo

FIELDS = (("overview", "overview_source"), ("biography", "biography_source"))


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    async with AsyncSessionLocal() as db:
        total = 0
        for field, source_key in FIELDS:
            rows = (
                await db.execute(
                    text(
                        f"SELECT id, attributes->>'{field}' FROM entities "
                        f"WHERE attributes->>'{source_key}' = 'machine' AND attributes->>'{field}' ~ "
                        r"'^(فیلم|سریال|شخص|Film|TV series|Person)\s*[:：]'"
                    )
                )
            ).all()
            fixed = 0
            for entity_id, value in rows:
                cleaned = strip_prompt_echo(value or "")
                if cleaned == (value or "") or not is_persian(cleaned):
                    continue
                fixed += 1
                if args.apply:
                    await db.execute(
                        text("UPDATE entities SET attributes = attributes || CAST(:patch AS jsonb) WHERE id = :id"),
                        {"id": entity_id, "patch": json.dumps({field: cleaned}, ensure_ascii=False)},
                    )
            print(f"{field}: {len(rows)} with a header, {fixed} fixable", flush=True)
            total += fixed
        if args.apply:
            await db.commit()
            print(f"fixed {total}")
        else:
            print("dry run; re-run with --apply to write")


if __name__ == "__main__":
    asyncio.run(main())
