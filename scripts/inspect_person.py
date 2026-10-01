"""
Prints what TMDb has for a person's Persian name -- to debug why
scripts/backfill_person_profiles.py leaves title_fa empty.

    python scripts/inspect_person.py "Simin Alizadeh"
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio
import json

from sqlalchemy import select

from app.core.database import make_bulk_sessionmaker
from app.modules.entities.models import Entity
from app.modules.sync.normalizer import person_name_attrs
from app.modules.sync.tmdb_client import TMDbClient


async def main(name: str) -> None:
    async with make_bulk_sessionmaker()() as db:
        row = (await db.execute(
            select(Entity.external_id).where(Entity.entity_type == "person", Entity.title == name).limit(1)
        )).first()
    if not row:
        print(f"no person named {name!r}")
        return
    raw = await TMDbClient().get_person(int(row[0]))
    fa = [t for t in (raw.get("translations") or {}).get("translations", []) if t.get("iso_639_1") == "fa"]
    print(json.dumps({
        "name": raw.get("name"),
        "place_of_birth": raw.get("place_of_birth"),
        "also_known_as": raw.get("also_known_as"),
        "fa_translation": fa,
        "person_name_attrs": person_name_attrs(raw),
    }, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
