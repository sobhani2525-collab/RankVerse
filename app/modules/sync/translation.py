"""
Machine translation of English TMDb overviews to Persian, for titles TMDb
has no fa-IR overview for (roughly three quarters of the catalog). Runs as
a Claude Message Batch -- no latency requirement, and batches cost half.
Driven by scripts/translate_overviews.py.

Each request's custom_id carries the entity id plus a hash of the English
text sent, so results can be applied statelessly (e.g. from a resumed
batch) and a result whose source text has since changed on TMDb is
dropped rather than written over the newer text.
"""
import hashlib
import json
import re
import uuid

import anthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

PERSIAN_CHARS = re.compile(r"[؀-ۿ]")

SYSTEM_PROMPT = """You translate film and TV synopses from English into Persian (Farsi) for an Iranian movie website.

Write natural, fluent Persian the way a professional Iranian film magazine would -- not a word-for-word rendering. Keep the meaning, tone and every plot detail of the original; do not add, summarize, or leave anything out.

Names of people, places, and fictional characters are written in Persian script as they are pronounced (e.g. "Michael Corleone" -> "مایکل کورلئونه"). Titles of works and brand names that are well known in Iran by a Persian name use that name.

Use Persian punctuation (، ؛ ؟ « ») and the zero-width non-joiner where standard Persian orthography calls for it (e.g. می‌شود).

Reply with the Persian translation only: no preamble, notes, quotes, or the original text."""


def source_hash(source: str) -> str:
    return hashlib.sha1(source.encode("utf-8")).hexdigest()[:16]


def make_custom_id(entity_id: uuid.UUID, source: str) -> str:
    return f"{entity_id.hex}_{source_hash(source)}"


def parse_custom_id(custom_id: str) -> tuple[uuid.UUID, str]:
    entity_hex, digest = custom_id.split("_", 1)
    return uuid.UUID(hex=entity_hex), digest


def is_persian(value: str | None) -> bool:
    return bool(value and PERSIAN_CHARS.search(value))


def english_source(attributes: dict) -> str | None:
    """
    The English text to translate, or None if the title doesn't need
    translating: it already has a Persian overview (from TMDb or an earlier
    translation run), or has no overview at all. Titles synced before
    overview_en existed only have `overview`, which is English exactly when
    it has no Persian characters.
    """
    if attributes.get("overview_source") in ("tmdb_fa", "machine") or is_persian(attributes.get("overview")):
        return None
    return attributes.get("overview_en") or attributes.get("overview") or None


async def titles_needing_translation(db: AsyncSession) -> list[dict]:
    rows = await db.execute(
        text(
            "SELECT id, entity_type, title, attributes FROM entities "
            "WHERE entity_type IN ('movie', 'tv_series') "
            "ORDER BY (attributes->>'external_vote_count')::int DESC NULLS LAST"
        )
    )
    out = []
    for entity_id, entity_type, title, attributes in rows.all():
        source = english_source(attributes or {})
        if source:
            out.append(
                {
                    "id": entity_id,
                    "entity_type": entity_type,
                    "title": title,
                    "year": (attributes or {}).get("year"),
                    "source": source,
                }
            )
    return out


def build_request(item: dict) -> Request:
    kind = "TV series" if item["entity_type"] == "tv_series" else "Film"
    year = f" ({item['year']})" if item.get("year") else ""
    return Request(
        custom_id=make_custom_id(item["id"], item["source"]),
        params=MessageCreateParamsNonStreaming(
            model=settings.overview_translation_model,
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": f"{kind}: {item['title']}{year}\n\nSynopsis:\n{item['source']}",
                }
            ],
        ),
    )


def make_client() -> anthropic.Anthropic:
    if settings.anthropic_api_key:
        return anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return anthropic.Anthropic()


def translation_from_message(message) -> str | None:
    """The Persian text of a finished request, or None if it isn't usable."""
    if message.stop_reason != "end_turn":
        return None
    translated = "".join(b.text for b in message.content if b.type == "text").strip()
    return translated if is_persian(translated) else None


async def apply_translation(db: AsyncSession, entity_id: uuid.UUID, digest: str, translated: str) -> bool:
    """
    Writes one translation, unless the title no longer needs it (TMDb
    gained a Persian overview since) or its English source changed since
    the request was built. Doesn't commit.
    """
    row = (
        await db.execute(text("SELECT attributes FROM entities WHERE id = :id"), {"id": entity_id})
    ).first()
    if row is None:
        return False
    source = english_source(row[0] or {})
    if source is None or source_hash(source) != digest:
        return False
    patch = {"overview": translated, "overview_en": source, "overview_source": "machine"}
    await db.execute(
        text("UPDATE entities SET attributes = attributes || CAST(:patch AS jsonb) WHERE id = :id"),
        {"id": entity_id, "patch": json.dumps(patch, ensure_ascii=False)},
    )
    return True
