"""
IMDb-only genres for movies and tv_series, from IMDb's official bulk
dataset (title.basics.tsv.gz, refreshed daily, ~200 MB). TMDb's genre
vocabulary has no "Biography", so that one genre comes from IMDb instead,
matched through attributes.imdb_id (see sync.imdb_ratings for the ratings
counterpart -- same dataset license: personal and non-commercial use only).

The edges are written with source=IMDB_EDGE_SOURCE, which TMDb re-syncs
leave alone (EntityRepository.replace_relationships only retracts edges of
its own source).
"""
import csv
import gzip
import logging
import sys
import uuid
from pathlib import Path

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

IMDB_BASICS_URL = "https://datasets.imdbws.com/title.basics.tsv.gz"
IMDB_EDGE_SOURCE = "imdb_dataset"

# IMDb genre name -> our genre entity (title, slug). Only genres TMDb lacks;
# the rest already come from TMDb with the TMDb wording.
IMDB_ONLY_GENRES: dict[str, tuple[str, str]] = {
    "Biography": ("Biography", "biography"),
}

# title.basics has a few multi-KB fields; the csv module's default 128 KB cap is fine
# today but not guaranteed, and QUOTE_NONE is required (titles contain bare quotes).
csv.field_size_limit(min(sys.maxsize, 2**31 - 1))


async def download_basics(dest: Path) -> Path:
    async with httpx.AsyncClient(timeout=600, follow_redirects=True) as client:
        async with client.stream("GET", IMDB_BASICS_URL) as response:
            response.raise_for_status()
            with dest.open("wb") as f:
                async for chunk in response.aiter_bytes():
                    f.write(chunk)
    return dest


def load_genres(path: Path, wanted: set[str]) -> dict[str, set[str]]:
    """{tconst: {IMDb-only genre names}} for the tconsts in `wanted` that
    carry at least one genre from IMDB_ONLY_GENRES."""
    found: dict[str, set[str]] = {}
    with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            if row["tconst"] not in wanted or row["genres"] == "\\N":
                continue
            names = {g for g in row["genres"].split(",") if g in IMDB_ONLY_GENRES}
            if names:
                found[row["tconst"]] = names
    return found


async def _genre_entity_id(db: AsyncSession, title: str, slug: str) -> uuid.UUID:
    """Slug-first, like SyncService._get_or_create_genre."""
    existing = (
        await db.execute(text("SELECT id, entity_type FROM entities WHERE slug = :slug"), {"slug": slug})
    ).first()
    if existing:
        # Slugs are unique across every entity type.
        if existing[1] != "genre":
            raise RuntimeError(f"slug {slug!r} already belongs to a {existing[1]}, not a genre")
        return existing[0]
    new_id = uuid.uuid4()
    await db.execute(
        text(
            "INSERT INTO entities (id, entity_type, external_id, external_source, title, slug, attributes) "
            "VALUES (:id, 'genre', :ext, 'imdb_genre', :title, :slug, '{}'::jsonb)"
        ),
        {"id": new_id, "ext": title, "title": title, "slug": slug},
    )
    return new_id


async def apply_genres(db: AsyncSession, basics_path: Path) -> dict:
    """
    Makes every movie/tv_series's IMDb-sourced has_genre edges match the
    dataset: adds missing ones, removes ones whose title no longer carries
    that genre on IMDb (or lost its imdb_id). Edges from other sources are
    never touched, nor is an edge TMDb already made to the same genre.
    """
    rows = (
        await db.execute(
            text(
                "SELECT id, attributes->>'imdb_id' FROM entities "
                "WHERE entity_type IN ('movie', 'tv_series') AND attributes->>'imdb_id' IS NOT NULL"
            )
        )
    ).all()
    by_imdb: dict[str, list] = {}
    for entity_id, imdb_id in rows:
        by_imdb.setdefault(imdb_id, []).append(entity_id)

    found = load_genres(basics_path, set(by_imdb))

    stats = {"titles": len(rows), "genres": {}}
    for imdb_name, (title, slug) in IMDB_ONLY_GENRES.items():
        genre_id = await _genre_entity_id(db, title, slug)
        target = {eid for tconst, names in found.items() if imdb_name in names for eid in by_imdb[tconst]}

        current = {
            r[0]
            for r in (
                await db.execute(
                    text(
                        "SELECT from_entity_id FROM relationships "
                        "WHERE to_entity_id = :g AND relation_type = 'has_genre' AND source = :src"
                    ),
                    {"g": genre_id, "src": IMDB_EDGE_SOURCE},
                )
            ).all()
        }
        to_add = [
            {"id": uuid.uuid4(), "f": eid, "g": genre_id, "src": IMDB_EDGE_SOURCE} for eid in target - current
        ]
        to_remove = list(current - target)

        for start in range(0, len(to_add), 1000):
            await db.execute(
                text(
                    "INSERT INTO relationships (id, from_entity_id, to_entity_id, relation_type, edge_metadata, weight, source) "
                    "VALUES (:id, :f, :g, 'has_genre', '{}'::jsonb, 1.0, :src) "
                    "ON CONFLICT (from_entity_id, to_entity_id, relation_type) DO NOTHING"
                ),
                to_add[start:start + 1000],
            )
        if to_remove:
            await db.execute(
                text(
                    "DELETE FROM relationships WHERE to_entity_id = :g AND relation_type = 'has_genre' "
                    "AND source = :src AND from_entity_id = ANY(:ids)"
                ),
                {"g": genre_id, "src": IMDB_EDGE_SOURCE, "ids": to_remove},
            )
        stats["genres"][title] = {"titles": len(target), "added": len(to_add), "removed": len(to_remove)}

    await db.commit()
    return stats
