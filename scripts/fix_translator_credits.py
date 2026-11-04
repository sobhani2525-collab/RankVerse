"""
One-off repair: removes the volunteer-translator signature ("مترجم: shabnam_05")
that TMDb's Persian synopses sometimes end with. Run from the repo root with
the venv active:
    python scripts/fix_translator_credits.py          # dry run, prints counts and samples
    python scripts/fix_translator_credits.py --apply
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import asyncio
import json

from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.modules.sync.credits import strip_translator_credit


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    async with AsyncSessionLocal() as db:
        await db.execute(text("SET LOCAL statement_timeout = '300s'"))
        rows = (
            await db.execute(
                text("SELECT id, title, attributes->>'overview' FROM entities WHERE attributes->>'overview' ~ 'مترجم|ترجمه\\s+(از|توسط|و)'")
            )
        ).all()
        fixed = 0
        for entity_id, title, overview in rows:
            cleaned = strip_translator_credit(overview)
            if cleaned == overview:
                continue
            fixed += 1
            if fixed <= 5:
                print(f"{title}: ...{overview[-70:]!r} -> ...{cleaned[-40:]!r}", flush=True)
            if args.apply:
                await db.execute(
                    text("UPDATE entities SET attributes = attributes || CAST(:patch AS jsonb) WHERE id = :id"),
                    {"id": entity_id, "patch": json.dumps({"overview": cleaned}, ensure_ascii=False)},
                )
        print(f"{len(rows)} mention a translator, {fixed} fixable", flush=True)
        if args.apply:
            await db.commit()
            print(f"fixed {fixed}")
        else:
            print("dry run; re-run with --apply to write")


if __name__ == "__main__":
    asyncio.run(main())
