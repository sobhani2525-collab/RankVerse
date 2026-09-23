"""
Deletes foreign (non-Iranian) movies/tv_series rated at or below the
catalog import's IMDb floor -- the same rule scripts/import_tmdb_catalog.py
applies to new titles (imdb_ratings.rating_above: IMDb rating, or the TMDb
score when IMDb has none), applied retroactively to titles already in the
DB. Iranian titles (original_language "fa" or country "IR", the same two
signals bulk_sync_iranian discovers by) are never touched.

Also removes people/production companies left with no relationships at all
once those titles are gone (their pages would be empty).

Deleting an entity cascades to its rankings, relationships, user ratings,
list items, favorites, battle votes and taste anchors (all ON DELETE
CASCADE) -- the report lists how many of those each run would remove.

Run from the repo root with the venv active, after `import_tmdb_catalog.py
--existing` and `sync_imdb_ratings.py` (titles synced before imdb_id
existed are left alone and reported, not judged):
    python scripts/prune_low_rated_titles.py [--imdb-above 5]         # report only
    python scripts/prune_low_rated_titles.py [--imdb-above 5] --yes   # delete
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import asyncio

from sqlalchemy import text

from app.core.database import AsyncSessionLocal

IRANIAN = "(attributes->>'original_language' = 'fa' OR attributes->>'country' = 'IR')"
SCORE = "COALESCE((attributes->>'imdb_rating')::float, (attributes->>'external_rating')::float)"

LOW_RATED = f"""
    SELECT id FROM entities
    WHERE entity_type IN ('movie', 'tv_series')
      AND attributes ? 'overview_source'
      AND NOT {IRANIAN}
      AND ({SCORE} IS NULL OR {SCORE} <= :floor)
"""

ORPHANS = """
    SELECT e.id FROM entities e
    WHERE e.entity_type IN ('person', 'production_company')
      AND e.external_source IN ('tmdb_person', 'tmdb_network')
      AND NOT EXISTS (SELECT 1 FROM relationships r WHERE r.from_entity_id = e.id OR r.to_entity_id = e.id)
      AND NOT EXISTS (SELECT 1 FROM user_favorites f WHERE f.entity_id = e.id)
      AND NOT EXISTS (SELECT 1 FROM user_ratings u WHERE u.entity_id = e.id)
      AND NOT EXISTS (SELECT 1 FROM user_list_items l WHERE l.entity_id = e.id)
"""


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--imdb-above", type=float, default=5.0, help="keep titles rated strictly above this (default 5)")
    parser.add_argument("--yes", action="store_true", help="actually delete (default: report only)")
    args = parser.parse_args()
    params = {"floor": args.imdb_above}

    async with AsyncSessionLocal() as db:
        unjudged = (
            await db.execute(
                text(
                    "SELECT count(*) FROM entities WHERE entity_type IN ('movie', 'tv_series') "
                    "AND NOT attributes ? 'overview_source'"
                )
            )
        ).scalar()
        rows = (
            await db.execute(
                text(
                    f"SELECT entity_type, title, attributes->>'year', attributes->>'imdb_rating', "
                    f"attributes->>'external_rating' FROM entities WHERE id IN ({LOW_RATED}) "
                    f"ORDER BY entity_type, title"
                ),
                params,
            )
        ).all()
        impact = (
            await db.execute(
                text(
                    f"""SELECT
                      (SELECT count(*) FROM user_ratings WHERE entity_id IN ({LOW_RATED})),
                      (SELECT count(*) FROM user_list_items WHERE entity_id IN ({LOW_RATED})),
                      (SELECT count(*) FROM user_favorites WHERE entity_id IN ({LOW_RATED})),
                      (SELECT count(*) FROM pair_votes WHERE left_item IN ({LOW_RATED}) OR right_item IN ({LOW_RATED}))"""
                ),
                params,
            )
        ).one()

        print(f"{len(rows)} foreign title(s) rated <= {args.imdb_above}:")
        for entity_type, title, year, imdb, tmdb in rows:
            score = f"IMDb {imdb}" if imdb else f"no IMDb rating, TMDb {tmdb}"
            print(f"  [{entity_type}] {title} ({year or '?'}) -- {score}")
        print(
            f"cascade: {impact[0]} user rating(s), {impact[1]} list item(s), "
            f"{impact[2]} favorite(s), {impact[3]} battle vote(s)"
        )
        if unjudged:
            print(f"{unjudged} title(s) not judged: synced before imdb_id existed (run import_tmdb_catalog.py --existing)")

        if not args.yes:
            print("report only -- re-run with --yes to delete")
            return

        deleted = (await db.execute(text(f"DELETE FROM entities WHERE id IN ({LOW_RATED})"), params)).rowcount
        orphans = (await db.execute(text(f"DELETE FROM entities WHERE id IN ({ORPHANS})"))).rowcount
        await db.commit()
        print(f"deleted {deleted} title(s) and {orphans} orphaned person/company entit(ies)")


if __name__ == "__main__":
    asyncio.run(main())
