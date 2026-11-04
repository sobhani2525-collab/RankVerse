"""
Machine Persian titles for movies/series TMDb has no fa-IR title for (about
three quarters of the catalog). Only well-voted titles are done
(settings.title_translation_min_votes); the result is stored as
attributes["title_fa"] with attributes["title_fa_source"] = "machine", and a
real TMDb title replaces it on the next sync (see SyncService's merge).
Driven by scripts/translate_titles_direct.py.
"""
import json
import re
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.sync.translation import is_persian

TITLE_SYSTEM_PROMPT = """You give the Persian (Farsi) title of a film or TV series for an Iranian movie website.

Rules:
- If the title has a well-known Persian title in Iran (the name it was released or dubbed under, or that Persian speakers commonly use), use that.
- Otherwise translate the title naturally into Persian. Transliterate names of people, places and brands into Persian script (e.g. "Bohemian Rhapsody" -> "راپسودی بوهمیایی", "Joker" -> "جوکر"). Never leave Latin letters in the title unless they are part of the official name (e.g. "X-Men", "Se7en").
- Short and natural, like a title on a poster. No year, no quotes, no explanation, no label such as "عنوان:".
- Use Persian letters (ی ک), digits as in the original, and a zero-width non-joiner where Persian spelling needs one.
- Output ONLY the Persian title, on one line."""

_LABEL = re.compile(r"^(?:عنوان(?: فارسی)?|Title|Persian title)\s*[:：]\s*", re.IGNORECASE)
_YEAR_TAIL = re.compile(r"\s*[(（][\d۰-۹]{4}[)）]\s*$")
_QUOTES = '"“”«»\'`'


def clean_title(raw: str) -> str | None:
    """The one-line Persian title from model output, or None if unusable."""
    lines = [line.strip() for line in raw.strip().splitlines() if line.strip()]
    if len(lines) != 1:
        return None
    title = _YEAR_TAIL.sub("", _LABEL.sub("", lines[0])).strip(_QUOTES + " ").replace("ي", "ی").replace("ك", "ک")
    if not title or len(title) > 120 or not is_persian(title):
        return None
    return title


async def titles_needing_translation(db: AsyncSession, redo: bool = False) -> list[dict]:
    """Titles without a Persian title; redo=True also returns the machine ones (to replace them)."""
    await db.execute(text("SET LOCAL statement_timeout = '300s'"))
    missing = "COALESCE(attributes->>'title_fa_source', '') = 'machine'" if redo else "COALESCE(attributes->>'title_fa', '') = ''"
    rows = await db.execute(
        text(
            "SELECT id, entity_type, title, attributes->>'year' "
            "FROM entities "
            "WHERE entity_type IN ('movie', 'tv_series') "
            f"AND {missing} "
            "AND (attributes->>'external_vote_count')::int >= :min_votes "
            "ORDER BY (attributes->>'external_vote_count')::int DESC"
        ),
        {"min_votes": settings.title_translation_min_votes},
    )
    return [{"id": r[0], "entity_type": r[1], "title": r[2], "year": r[3]} for r in rows.all() if r[2]]


async def apply_title_translation(db: AsyncSession, entity_id: uuid.UUID, title_fa: str) -> bool:
    """Writes the title unless TMDb gained one since the list was built (a machine title is replaceable). Doesn't commit."""
    result = await db.execute(
        text(
            "UPDATE entities SET attributes = attributes || CAST(:patch AS jsonb) "
            "WHERE id = :id AND (COALESCE(attributes->>'title_fa', '') = '' "
            "OR COALESCE(attributes->>'title_fa_source', '') = 'machine')"
        ),
        {"id": entity_id, "patch": json.dumps({"title_fa": title_fa, "title_fa_source": "machine"}, ensure_ascii=False)},
    )
    return result.rowcount > 0
