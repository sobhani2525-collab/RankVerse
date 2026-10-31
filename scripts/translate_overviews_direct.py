"""
Same job as scripts/translate_overviews.py (machine-translate English
movie/series overviews to Persian), but with plain (non-batch) requests, for
Anthropic-compatible gateways without Message Batches. Set in .env:
    ANTHROPIC_API_KEY=...
    ANTHROPIC_BASE_URL=https://tokenharbor.ai
    BIOGRAPHY_TRANSLATION_MODEL=<model id>   (also used for overviews)

Most-voted titles first. Run from the repo root with the venv active:
    python scripts/translate_overviews_direct.py [--limit N] [--workers 4] [--no-thinking] [--yes]
Safe to re-run: only titles still untranslated are processed, results are
committed every CHUNK titles, and the run stops cleanly on the first 429
(allowance used up) -- re-run after it resets.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse
import asyncio
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import anthropic

from app.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.sync.translation import (
    SYSTEM_PROMPT,
    apply_translation,
    is_persian,
    source_hash,
    strip_prompt_echo,
    titles_needing_translation,
)

CHUNK = 50
REQUEST_TIMEOUT = 180.0
MAX_RATE_WAITS = 8
QUOTA_EXHAUSTED = threading.Event()


def translate_one(client, model: str, item: dict, thinking_off: bool = False, attempts: int = 3) -> str | None:
    kind = "TV series" if item["entity_type"] == "tv_series" else "Film"
    year = f" ({item['year']})" if item.get("year") else ""
    extra = {"thinking": {"type": "disabled"}} if thinking_off else {}
    reason = ""
    attempt = rate_waits = 0
    while attempt < attempts:
        if QUOTA_EXHAUSTED.is_set():
            return None
        if attempt:
            time.sleep(5 * attempt)
        attempt += 1
        try:
            message = client.messages.create(
                model=model,
                max_tokens=settings.biography_translation_max_tokens,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": f"{kind}: {item['title']}{year}\n\nSynopsis:\n{item['source']}"}],
                **extra,
            )
        except anthropic.RateLimitError as exc:
            # A per-minute limit (e.g. AvalAI tiers) clears by waiting; only a
            # used-up allowance, or a limit that never clears, ends the run.
            rate_waits += 1
            if "allowance" in str(exc).lower() or rate_waits > MAX_RATE_WAITS:
                if not QUOTA_EXHAUSTED.is_set():
                    print(f"  quota exhausted, stopping: {str(exc)[:300]}", flush=True)
                QUOTA_EXHAUSTED.set()
                return None
            attempt -= 1  # a rate-limit wait is not a failed attempt
            time.sleep(min(15 * rate_waits, 60))
            continue
        except Exception as exc:  # network / gateway hiccup: retry
            reason = f"error: {str(exc)[:200]}"
            continue
        text = strip_prompt_echo("".join(b.text for b in message.content if b.type == "text").strip())
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
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--no-thinking", action="store_true", help="ask the gateway to disable reasoning (if supported)")
    args = parser.parse_args()

    model = settings.biography_translation_model or settings.overview_translation_model
    kwargs = {"base_url": settings.anthropic_base_url} if settings.anthropic_base_url else {}
    if settings.anthropic_api_key:
        kwargs["api_key"] = settings.anthropic_api_key
    client = anthropic.Anthropic(timeout=REQUEST_TIMEOUT, max_retries=0, **kwargs)

    print("loading the list from the database (can take a minute)...", flush=True)
    async with AsyncSessionLocal() as db:
        items = await titles_needing_translation(db)
    if args.limit is not None:
        items = items[: args.limit]
    if not items:
        print("nothing to translate", flush=True)
        return
    chars = sum(len(i["source"]) for i in items)
    print(f"{len(items)} overview(s) with {model} (~{chars:,} English characters)", flush=True)
    if not args.yes and input("start? [y/N] ").strip().lower() != "y":
        return

    applied = skipped = failed = 0
    loop = asyncio.get_running_loop()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for start in range(0, len(items), CHUNK):
            if QUOTA_EXHAUSTED.is_set():
                break
            chunk = items[start : start + CHUNK]
            results = await asyncio.gather(
                *(loop.run_in_executor(pool, translate_one, client, model, i, args.no_thinking) for i in chunk)
            )
            async with AsyncSessionLocal() as db:
                for item, translated in zip(chunk, results):
                    if translated is None:
                        failed += 1
                    elif await apply_translation(db, item["id"], source_hash(item["source"]), translated):
                        applied += 1
                    else:
                        skipped += 1
                await db.commit()
            print(f"{start + len(chunk)}/{len(items)}: applied {applied}, skipped {skipped}, failed {failed}", flush=True)

    if QUOTA_EXHAUSTED.is_set():
        print("stopped: the API allowance is used up. Re-run the same command after it resets; finished work is saved.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
