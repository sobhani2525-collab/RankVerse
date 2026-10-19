"""
Same job as scripts/translate_biographies.py, but with plain (non-batch)
requests, for Anthropic-compatible gateways that don't support Message
Batches. Set in .env:
    ANTHROPIC_API_KEY=...
    ANTHROPIC_BASE_URL=https://tokenharbor.ai
    BIOGRAPHY_TRANSLATION_MODEL=<model id>

Run from the repo root with the venv active:
    python scripts/translate_biographies_direct.py [--limit N] [--workers 8] [--yes]
Safe to re-run: only people still untranslated are processed, and results
are committed as they arrive.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import asyncio
from concurrent.futures import ThreadPoolExecutor

import anthropic

from app.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.sync.translation import (
    BIOGRAPHY_SYSTEM_PROMPT,
    apply_biography_translation,
    is_persian,
    people_needing_translation,
    source_hash,
)

CHUNK = 50


def translate_one(client, model: str, item: dict) -> str | None:
    try:
        message = client.messages.create(
            model=model,
            max_tokens=4096,
            system=BIOGRAPHY_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"Person: {item['title']}\n\nBiography:\n{item['source']}"}],
        )
    except Exception as exc:  # network / rate limit: leave it for the next run
        print(f"  failed {item['title']}: {exc}", flush=True)
        return None
    if message.stop_reason != "end_turn":
        return None
    text = "".join(b.text for b in message.content if b.type == "text").strip()
    return text if is_persian(text) else None


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--yes", action="store_true")
    args = parser.parse_args()

    model = settings.biography_translation_model or settings.overview_translation_model
    kwargs = {"base_url": settings.anthropic_base_url} if settings.anthropic_base_url else {}
    if settings.anthropic_api_key:
        kwargs["api_key"] = settings.anthropic_api_key
    client = anthropic.Anthropic(**kwargs)

    async with AsyncSessionLocal() as db:
        items = await people_needing_translation(db)
    if args.limit is not None:
        items = items[: args.limit]
    if not items:
        print("nothing to translate", flush=True)
        return
    chars = sum(len(i["source"]) for i in items)
    print(f"{len(items)} biography(ies) with {model} (~{chars:,} English characters)", flush=True)
    if not args.yes and input("start? [y/N] ").strip().lower() != "y":
        return

    applied = skipped = failed = 0
    loop = asyncio.get_running_loop()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for start in range(0, len(items), CHUNK):
            chunk = items[start : start + CHUNK]
            results = await asyncio.gather(
                *(loop.run_in_executor(pool, translate_one, client, model, i) for i in chunk)
            )
            async with AsyncSessionLocal() as db:
                for item, translated in zip(chunk, results):
                    if translated is None:
                        failed += 1
                    elif await apply_biography_translation(db, item["id"], source_hash(item["source"]), translated):
                        applied += 1
                    else:
                        skipped += 1
                await db.commit()
            print(f"{start + len(chunk)}/{len(items)}: applied {applied}, skipped {skipped}, failed {failed}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
