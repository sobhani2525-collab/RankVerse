"""
One-time cleanup for genre entities left over from BEFORE the
TV_GENRE_NAME_OVERRIDES one-to-many fix (see normalizer.py) -- a fused
TMDb TV genre like "Sci-Fi & Fantasy" that used to be stored as its own
standalone genre entity, with has_genre edges pointing at it, instead of
fanning out to the movie-side genres it actually represents (Science
Fiction + Fantasy).

Re-syncing a TV series (sync_tv_series) now self-heals this going forward
via EntityRepository.replace_relationships -- but an existing stale genre
entity that nothing has re-synced yet stays orphaned in the graph. This
script finds those, reports exactly what would change, and only mutates
the database once you pass --confirm.

Usage:
    python scripts/cleanup_stale_tv_genres.py            # dry run: report only
    python scripts/cleanup_stale_tv_genres.py --confirm  # migrate edges + delete stale entities

Run from the repo root with the venv active and DATABASE_URL pointed at
the database you actually want to inspect/fix.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio

from slugify import slugify
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.modules.entities.models import Entity, RelationshipEdge
from app.modules.entities.repository import EntityRepository
from app.modules.sync.normalizer import TV_GENRE_NAME_OVERRIDES
from app.modules.sync.service import SyncService


async def find_stale_genres(db) -> list[tuple[Entity, list[str]]]:
    """
    Genre entities whose slug matches a fused TMDb TV genre name that
    TV_GENRE_NAME_OVERRIDES maps to something else -- i.e. an entity that
    should never exist under the current mapping.
    """
    found = []
    for fused_name, replacement_names in TV_GENRE_NAME_OVERRIDES.items():
        stale_slug = slugify(fused_name)
        stmt = select(Entity).where(Entity.slug == stale_slug, Entity.entity_type == "genre")
        entity = (await db.execute(stmt)).scalar_one_or_none()
        if entity:
            found.append((entity, replacement_names))
    return found


async def report(db, stale_genre: Entity) -> list[RelationshipEdge]:
    stmt = (
        select(RelationshipEdge)
        .where(RelationshipEdge.to_entity_id == stale_genre.id)
    )
    edges = list((await db.execute(stmt)).scalars().all())

    print(f"\n=== Stale genre entity: \"{stale_genre.title}\" (slug={stale_genre.slug}, id={stale_genre.id}) ===")
    if not edges:
        print("  no relationships point at it -- safe to delete on its own.")
        return edges

    print(f"  {len(edges)} relationship(s) point at it:")
    for edge in edges:
        from_entity = await db.get(Entity, edge.from_entity_id)
        label = from_entity.title if from_entity else f"<missing entity {edge.from_entity_id}>"
        entity_type = from_entity.entity_type if from_entity else "?"
        print(f"    {label} ({entity_type}) --{edge.relation_type}--> {stale_genre.title}")

    non_genre_edges = [e for e in edges if e.relation_type != "has_genre"]
    if non_genre_edges:
        print(
            f"  WARNING: {len(non_genre_edges)} edge(s) use a relation_type other than "
            f"'has_genre' -- this script only knows how to migrate has_genre edges, "
            f"skipping this entity entirely for safety."
        )
    return edges


async def migrate_and_delete(db, stale_genre: Entity, replacement_names: list[str], edges: list[RelationshipEdge]) -> None:
    sync_service = SyncService(db)
    repo = EntityRepository(db)

    replacements = [await sync_service._get_or_create_genre(name) for name in replacement_names]
    print(f"  migrating to: {', '.join(r.title for r in replacements)}")

    by_from_entity: dict = {}
    for edge in edges:
        by_from_entity.setdefault(edge.from_entity_id, []).append(edge)

    for from_entity_id, from_edges in by_from_entity.items():
        existing = await repo.get_related(from_entity_id, relation_type="has_genre")
        keep_ids = {e.to_entity_id for e in existing if e.to_entity_id != stale_genre.id}
        keep_ids |= {r.id for r in replacements}
        await repo.replace_relationships(from_entity_id, "has_genre", list(keep_ids))
        print(f"    migrated has_genre edges for entity {from_entity_id}")

    await db.delete(stale_genre)
    print(f"  deleted stale entity \"{stale_genre.title}\" ({stale_genre.id})")


async def main():
    confirm = "--confirm" in sys.argv

    async with AsyncSessionLocal() as db:
        stale = await find_stale_genres(db)
        if not stale:
            print("No stale fused-genre entities found. Nothing to do.")
            return

        edges_by_entity = {}
        skip_ids = set()
        for entity, replacement_names in stale:
            edges = await report(db, entity)
            edges_by_entity[entity.id] = edges
            if any(e.relation_type != "has_genre" for e in edges):
                skip_ids.add(entity.id)

        if not confirm:
            print("\nDry run only -- pass --confirm to migrate relationships and delete these entities.")
            return

        print("\n--confirm passed, applying changes...")
        for entity, replacement_names in stale:
            if entity.id in skip_ids:
                continue
            await migrate_and_delete(db, entity, replacement_names, edges_by_entity[entity.id])

        await db.commit()
        print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
