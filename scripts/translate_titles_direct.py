"""
Machine Persian titles for well-voted movies/series that TMDb has no Persian
title for (see app/modules/sync/title_translation.py). Plain (non-batch)
requests through the same gateway/model as the overview scripts (.env:
ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, BIOGRAPHY_TRANSLATION_MODEL).

Run from the repo root with the venv active:
    python scripts/translate_titles_direct.py [--limit N] [--workers 4] [--no-thinking] [--yes]
Safe to re-run: only titles still without a Persian title are processed.
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
from sqlalchemy import text

from app.config import settings
from app.core.database import AsyncSessionLocal
from app.modules.sync.title_translation import (
    TITLE_SYSTEM_PROMPT,
    apply_title_translation,
    clean_title,
    titles_needing_translation,
)

CHUNK = 20
REQUEST_TIMEOUT = 120.0
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
                max_tokens=2000,
                system=TITLE_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": f"{kind}: {item['title']}{year}"}],
                **extra,
            )
        except anthropic.RateLimitError as exc:
            rate_waits += 1
            if "allowance" in str(exc).lower() or rate_waits > MAX_RATE_WAITS:
                if not QUOTA_EXHAUSTED.is_set():
                    print(f"  quota exhausted, stopping: {str(exc)[:300]}", flush=True)
                QUOTA_EXHAUSTED.set()
                return None
            attempt -= 1  # a rate-limit wait is not a failed attempt
            wait = min(15 * rate_waits, 60)
            print(f"  rate limited ({rate_waits}/{MAX_RATE_WAITS}), waiting {wait}s", flush=True)
            time.sleep(wait)
            continue
        except Exception as exc:  # network / gateway hiccup: retry
            reason = f"error: {str(exc)[:200]}"
            print(f"  retrying after {reason}", flush=True)
            continue
        raw = "".join(b.text for b in message.content if b.type == "text")
        title = clean_title(raw) if message.stop_reason == "end_turn" else None
        if title:
            return title
        reason = f"stop_reason={message.stop_reason}, got: {raw[:80]!r}"
    print(f"  gave up on {item['title']}: {reason}", flush=True)
    return None


async def with_db_retry(what: str, work, attempts: int = 4):
    """Run work(db) in a fresh session; retry when the connection to the remote DB drops."""
    for attempt in range(1, attempts + 1):
        try:
            async with AsyncSessionLocal() as db:
                return await work(db)
        except Exception as exc:
            print(f"  database error during {what} ({attempt}/{attempts}): {str(exc)[:150]}", flush=True)
            if attempt == attempts:
                raise
            await asyncio.sleep(10 * attempt)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--model", default=None, help="model id (default: BIOGRAPHY_TRANSLATION_MODEL from .env)")
    parser.add_argument("--dry-run", action="store_true", help="print old => new titles, save nothing")
    parser.add_argument("--redo", action="store_true", help="also redo titles already made by a machine (replaces them)")
    parser.add_argument("--no-thinking", action="store_true", help="ask the gateway to disable reasoning (if supported)")
    args = parser.parse_args()

    model = args.model or settings.biography_translation_model or settings.overview_translation_model
    kwargs = {"base_url": settings.anthropic_base_url} if settings.anthropic_base_url else {}
    if settings.anthropic_api_key:
        kwargs["api_key"] = settings.anthropic_api_key
    client = anthropic.Anthropic(timeout=REQUEST_TIMEOUT, max_retries=0, **kwargs)

    print("loading the list from the database (can take a minute)...", flush=True)
    items = await with_db_retry("load list", lambda db: titles_needing_translation(db, args.redo))
    if args.limit is not None:
        items = items[: args.limit]
    if not items:
        print("nothing to translate", flush=True)
        return
    print(f"{len(items)} title(s) with {model} (>= {settings.title_translation_min_votes} votes)", flush=True)
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

            if args.dry_run:
                for item, title in zip(chunk, results):
                    print(f"  {item['title']} ({item['year']}) => {title}", flush=True)
                continue

            async def save(db, chunk=chunk, results=results):
                # the remote DB can take longer than the app's 20s default to write
                await db.execute(text("SET LOCAL statement_timeout = '180s'"))
                outcomes = []
                for item, title in zip(chunk, results):
                    if title is None:
                        outcomes.append("failed")
                    elif await apply_title_translation(db, item["id"], title):
                        outcomes.append("applied")
                    else:
                        outcomes.append("skipped")
                await db.commit()
                return outcomes

            try:
                outcomes = await with_db_retry("save results", save)
            except Exception:
                outcomes = ["failed"] * len(chunk)
            applied += outcomes.count("applied")
            skipped += outcomes.count("skipped")
            failed += outcomes.count("failed")
            print(f"{start + len(chunk)}/{len(items)}: applied {applied}, skipped {skipped}, failed {failed}", flush=True)

    if QUOTA_EXHAUSTED.is_set():
        print("stopped: the API allowance is used up. Re-run the same command after it resets; finished work is saved.", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
