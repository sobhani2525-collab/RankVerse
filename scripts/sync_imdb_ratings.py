"""
Refreshes IMDb rating/votes on every movie/tv_series that has an imdb_id,
from IMDb's daily title.ratings.tsv.gz (see app/modules/sync/imdb_ratings.py).
Safe to re-run any time -- e.g. daily, or after import_tmdb_catalog.py.

Run from the repo root with the venv active:
    python scripts/sync_imdb_ratings.py [path/to/title.ratings.tsv.gz]

Without a path, the dataset is downloaded to a temp file first.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio
import tempfile

from app.core.database import AsyncSessionLocal
from app.modules.sync.imdb_ratings import apply_ratings, download_ratings


async def main(path_arg: str | None) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        if path_arg:
            path = Path(path_arg)
        else:
            print("downloading IMDb title.ratings.tsv.gz...", flush=True)
            path = await download_ratings(Path(tmp) / "title.ratings.tsv.gz")
        async with AsyncSessionLocal() as db:
            stats = await apply_ratings(db, path)
    print(
        f"{stats['titles']} title(s): {stats['with_imdb_id']} with imdb_id, "
        f"{stats['rated']} rated, {stats['without_rating']} without an IMDb rating"
    )


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else None))
