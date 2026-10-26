"""
Adds the IMDb-only genres (today just Biography -- TMDb has none) to every
movie/tv_series that has an imdb_id, from IMDb's daily title.basics.tsv.gz
(see app/modules/sync/imdb_genres.py). Safe to re-run any time -- e.g.
after import_tmdb_catalog.py or sync_imdb_ratings.py.

Run from the repo root with the venv active:
    python scripts/sync_imdb_genres.py [path/to/title.basics.tsv.gz]

Without a path, the dataset (~200 MB) is downloaded to a temp file first.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio
import tempfile

from app.core.database import AsyncSessionLocal
from app.modules.sync.imdb_genres import apply_genres, download_basics


async def main(path_arg: str | None) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        if path_arg:
            path = Path(path_arg)
        else:
            print("downloading IMDb title.basics.tsv.gz...", flush=True)
            path = await download_basics(Path(tmp) / "title.basics.tsv.gz")
        async with AsyncSessionLocal() as db:
            stats = await apply_genres(db, path)
    print(f"{stats['titles']} title(s) with an imdb_id")
    for genre, s in stats["genres"].items():
        print(f"  {genre}: {s['titles']} title(s), {s['added']} edge(s) added, {s['removed']} removed")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else None))
