"""
Syncs a handful of well-known TV series from TMDb (Breaking Bad, Better
Call Saul, Game of Thrones) to exercise the tv_series entity pipeline
end-to-end (entity + directed_by/acted_in/creator/has_genre/aired_on
edges), then prints each synced show's relationships and checks whether
any person entity got reused across two of the synced shows (Breaking
Bad and Better Call Saul share several cast members -- Giancarlo
Esposito, Jonathan Banks, and guest appearances by Bryan Cranston/Aaron
Paul -- which should all resolve to the same person entity via
_get_or_create_person's source="tmdb_person" + external_id lookup).

Run from the repo root with the venv active:
    python scripts/sync_test_tv_series.py

Requires network access to api.themoviedb.org and a valid TMDB_API_KEY
in .env -- this environment's sandboxed tool network couldn't reach
TMDb directly, so this is meant to be run from a normal terminal.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio
import uuid

from sqlalchemy import select, func

from app.core.database import AsyncSessionLocal
from app.modules.entities.models import Entity, RelationshipEdge
from app.modules.sync.service import SyncService

# (tmdb_id, label) -- Breaking Bad, Better Call Saul, Game of Thrones
TV_SERIES = [
    (1396, "Breaking Bad"),
    (60059, "Better Call Saul"),
    (1399, "Game of Thrones"),
]


async def sync_all() -> list[str]:
    synced_ids: list[str] = []
    async with AsyncSessionLocal() as db:
        sync_service = SyncService(db)
        for tmdb_id, label in TV_SERIES:
            try:
                result = await sync_service.sync_tv_series(tmdb_id)
                synced_ids.append(result["id"])
                print(f"synced: {label} (tmdb {tmdb_id}) -> {result['title']} | /{result['slug']}")
            except Exception as e:
                print(f"failed to sync {label} (tmdb {tmdb_id}): {e}")
    return synced_ids


async def print_relationships(entity_ids: list[str]) -> None:
    async with AsyncSessionLocal() as db:
        for eid in entity_ids:
            entity = await db.get(Entity, uuid.UUID(eid))
            if not entity:
                continue
            print(f"\n=== {entity.title} ({entity.slug}) ===")
            print(f"attributes: {entity.attributes}")

            stmt = (
                select(RelationshipEdge.relation_type, Entity.title, Entity.entity_type, Entity.external_id)
                .join(Entity, Entity.id == RelationshipEdge.to_entity_id)
                .where(RelationshipEdge.from_entity_id == entity.id)
                .order_by(RelationshipEdge.relation_type)
            )
            rows = (await db.execute(stmt)).all()
            for relation_type, title, entity_type, external_id in rows:
                print(f"  {relation_type:12s} -> {title} ({entity_type}, external_id={external_id})")


async def print_shared_people(entity_ids: list[str]) -> None:
    """People connected to 2+ of the synced shows -- proof _get_or_create_person dedups correctly."""
    ids = [uuid.UUID(i) for i in entity_ids]
    async with AsyncSessionLocal() as db:
        stmt = (
            select(Entity.title, Entity.external_id, func.count(func.distinct(RelationshipEdge.from_entity_id)))
            .join(RelationshipEdge, RelationshipEdge.to_entity_id == Entity.id)
            .where(RelationshipEdge.from_entity_id.in_(ids), Entity.entity_type == "person")
            .group_by(Entity.title, Entity.external_id)
            .having(func.count(func.distinct(RelationshipEdge.from_entity_id)) > 1)
        )
        rows = (await db.execute(stmt)).all()
        print("\n=== People shared across 2+ of the synced shows (dedup proof) ===")
        if not rows:
            print("  (none -- either no crossover cast this run, or something's wrong)")
        for title, ext_id, count in rows:
            print(f"  {title} (tmdb person id {ext_id}) appears in {count} of the synced shows")


async def main():
    synced_ids = await sync_all()
    await print_relationships(synced_ids)
    await print_shared_people(synced_ids)


if __name__ == "__main__":
    asyncio.run(main())
