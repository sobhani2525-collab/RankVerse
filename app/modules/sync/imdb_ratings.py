"""
IMDb rating/votes for movies and tv_series, from IMDb's official bulk
dataset (https://developer.imdb.com/non-commercial-datasets/ --
title.ratings.tsv.gz, refreshed daily, ~9 MB). TMDb only gives us the
imdb_id (see sync.normalizer), never the rating itself.

The dataset is licensed for personal and non-commercial use only.
"""
import csv
import gzip
import io
import json
import logging
from pathlib import Path

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

IMDB_RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz"


async def download_ratings(dest: Path) -> Path:
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        async with client.stream("GET", IMDB_RATINGS_URL) as response:
            response.raise_for_status()
            with dest.open("wb") as f:
                async for chunk in response.aiter_bytes():
                    f.write(chunk)
    return dest


def load_ratings(path: Path, wanted: set[str] | None = None) -> dict[str, tuple[float, int]]:
    """{tconst: (averageRating, numVotes)} for the tconsts in `wanted`, or
    for every rated title when wanted is None (~1.6M rows)."""
    ratings: dict[str, tuple[float, int]] = {}
    with gzip.open(path, "rt", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            if wanted is None or row["tconst"] in wanted:
                ratings[row["tconst"]] = (float(row["averageRating"]), int(row["numVotes"]))
    return ratings


def rating_above(ratings: dict[str, tuple[float, int]], floor: float):
    """
    A SyncService accept= predicate keeping titles rated strictly above
    `floor` on IMDb. A title IMDb has no rating for (no imdb_id on TMDb,
    or not in the dataset) is judged by its TMDb vote_average instead, so
    it isn't dropped just for missing IMDb data.
    """
    def accept(normalized: dict) -> bool:
        attrs = normalized["attributes"]
        imdb = ratings.get(attrs.get("imdb_id") or "")
        score = imdb[0] if imdb else attrs.get("external_rating")
        return score is not None and score > floor

    return accept


async def apply_ratings(db: AsyncSession, ratings_path: Path) -> dict:
    """
    Writes attributes.imdb_rating / imdb_votes on every movie/tv_series
    whose attributes.imdb_id appears in the dataset, and removes them from
    titles whose imdb_id no longer does (or was cleared). Merges into the
    JSONB rather than rewriting it, so nothing else in attributes is touched.
    """
    rows = (
        await db.execute(
            text(
                "SELECT id, attributes->>'imdb_id' FROM entities "
                "WHERE entity_type IN ('movie', 'tv_series')"
            )
        )
    ).all()
    by_imdb: dict[str, list] = {}
    unlinked = []
    for entity_id, imdb_id in rows:
        if imdb_id:
            by_imdb.setdefault(imdb_id, []).append(entity_id)
        else:
            unlinked.append(entity_id)

    ratings = load_ratings(ratings_path, set(by_imdb))

    updates = [
        {"id": entity_id, "patch": json.dumps({"imdb_rating": rating, "imdb_votes": votes})}
        for imdb_id, (rating, votes) in ratings.items()
        for entity_id in by_imdb[imdb_id]
    ]
    unrated = [entity_id for imdb_id, ids in by_imdb.items() if imdb_id not in ratings for entity_id in ids]
    unrated += unlinked

    for start in range(0, len(updates), 1000):
        await db.execute(
            text("UPDATE entities SET attributes = attributes || CAST(:patch AS jsonb) WHERE id = :id"),
            updates[start:start + 1000],
        )
    if unrated:
        await db.execute(
            text(
                "UPDATE entities SET attributes = attributes - 'imdb_rating' - 'imdb_votes' "
                "WHERE id = ANY(:ids) AND (attributes ? 'imdb_rating' OR attributes ? 'imdb_votes')"
            ),
            {"ids": unrated},
        )
    await db.commit()
    return {
        "titles": len(rows),
        "with_imdb_id": len(rows) - len(unlinked),
        "rated": len(updates),
        "without_rating": len(unrated),
    }
