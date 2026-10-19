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
import time
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


def translate_one(client, model: str, item: dict, thinking_off: bool = False, attempts: int = 3) -> str | None:
    extra = {"thinking": {"type": "disabled"}} if thinking_off else {}
    reason = ""
    for attempt in range(attempts):
        if attempt:
            time.sleep(5 * attempt)
        try:
            message = client.messages.create(
                model=model,
                max_tokens=settings.biography_translation_max_tokens,
                system=BIOGRAPHY_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": f"Person: {item['title']}\n\nBiography:\n{item['source']}"}],
                **extra,
            )
        except Exception as exc:  # network / rate limit / gateway hiccup: retry
            reason = f"error: {str(exc)[:200]}"
            continue
        text = "".join(b.text for b in message.content if b.type == "text").strip()
        if message.stop_reason != "end_turn":
            reason = f"stop_reason={message.stop_reason}, {len(text)} chars"
        elif not is_persian(text):
            reason = f"no Persian text, got: {text[:120]!r}"
        else:
            return text
    print(f"  gave up on {item['title']}: {reason}", flush=True)
    return None


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--no-thinking", action="store_true", help="ask the gateway to disable reasoning (if supported)")
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
                *(loop.run_in_executor(pool, translate_one, client, model, i, args.no_thinking) for i in chunk)
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
