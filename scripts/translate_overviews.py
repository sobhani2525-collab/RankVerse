"""
Machine-translates to Persian the English overview of every movie/tv_series
that TMDb has no Persian overview for (see app/modules/sync/translation.py),
via one Claude Message Batch (Claude Haiku 4.5 by default, half price, most
batches finish within the hour).

Run from the repo root with the venv active (needs ANTHROPIC_API_KEY in
.env or the environment):
    python scripts/translate_overviews.py [--limit N] [--yes]
    python scripts/translate_overviews.py --resume <batch_id>

--limit translates only the N most-voted titles (e.g. a trial run).
The batch id is printed right after submission; if the script is
interrupted, --resume picks the same batch back up and applies its results
(results stay downloadable for 29 days). Re-running without --resume only
submits titles still untranslated, so it's also safe to just run again.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import asyncio
import time

from app.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.sync.translation import (
    apply_translation,
    build_request,
    make_client,
    parse_custom_id,
    titles_needing_translation,
    translation_from_message,
)

POLL_SECONDS = 60
MAX_BATCH_REQUESTS = 100_000


def wait_for_batch(client, batch_id: str):
    while True:
        batch = client.messages.batches.retrieve(batch_id)
        counts = batch.request_counts
        print(
            f"batch {batch_id}: {batch.processing_status} "
            f"(processing {counts.processing}, succeeded {counts.succeeded}, errored {counts.errored})",
            flush=True,
        )
        if batch.processing_status == "ended":
            return batch
        time.sleep(POLL_SECONDS)


async def apply_results(client, batch_id: str) -> None:
    applied = skipped = failed = 0
    async with AsyncSessionLocal() as db:
        for result in client.messages.batches.results(batch_id):
            entity_id, digest = parse_custom_id(result.custom_id)
            translated = (
                translation_from_message(result.result.message) if result.result.type == "succeeded" else None
            )
            if translated is None:
                failed += 1
                continue
            if await apply_translation(db, entity_id, digest, translated):
                applied += 1
            else:
                skipped += 1
            if applied and applied % 500 == 0:
                await db.commit()
        await db.commit()
    print(
        f"applied {applied} translation(s); {skipped} skipped (source changed or no longer needed); "
        f"{failed} failed (re-run the script to retry those)",
        flush=True,
    )


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--resume", metavar="BATCH_ID", default=None)
    parser.add_argument("--yes", action="store_true", help="submit without the confirmation prompt")
    args = parser.parse_args()

    client = make_client()

    if args.resume:
        wait_for_batch(client, args.resume)
        await apply_results(client, args.resume)
        return

    async with AsyncSessionLocal() as db:
        items = await titles_needing_translation(db)
    if args.limit is not None:
        items = items[: args.limit]
    items = items[:MAX_BATCH_REQUESTS]
    if not items:
        print("nothing to translate", flush=True)
        return

    chars = sum(len(i["source"]) for i in items)
    print(
        f"{len(items)} overview(s) to translate with {settings.overview_translation_model} "
        f"(~{chars:,} English characters)",
        flush=True,
    )
    if not args.yes and input("submit batch? [y/N] ").strip().lower() != "y":
        return

    batch = client.messages.batches.create(requests=[build_request(i) for i in items])
    print(f"submitted batch {batch.id} -- if interrupted, resume with: --resume {batch.id}", flush=True)
    wait_for_batch(client, batch.id)
    await apply_results(client, batch.id)


if __name__ == "__main__":
    asyncio.run(main())
