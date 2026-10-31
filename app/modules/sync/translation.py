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

# Bumped whenever SYSTEM_PROMPT changes in a way that makes older machine
# translations stale. A "machine" overview written under an older version
# (or before versions existed: none stored) is queued for translation again.
# v2: personal and character names stay in Latin script.
# v3: quality rules (no literal translation, agreement, no invented words).
TRANSLATION_VERSION = 3

SYSTEM_PROMPT = """You translate film and TV synopses from English into Persian (Farsi) for an Iranian movie website.

Write natural, fluent Persian the way a professional Iranian film magazine would -- not a word-for-word rendering. Keep the meaning, tone and every plot detail of the original; do not add, summarize, or leave anything out.

Keep the names of people (actors, directors, real persons) and of fictional characters exactly as in the English text, in Latin script -- never transliterate them into Persian script (e.g. "Michael Corleone" stays "Michael Corleone"). Well-known place names may be written in Persian (e.g. "New York" -> "نیویورک"). Titles of works and brand names that are well known in Iran by a Persian name use that name.

Use Persian punctuation (، ؛ ؟ « ») and the zero-width non-joiner where standard Persian orthography calls for it (e.g. می‌شود).

Quality rules for the Persian:
- Never translate literally. Re-express each sentence the way a native writer would: "begins to realize" -> "کم‌کم پی می‌برد", "his entire existence" -> "تمام زندگی‌اش", "long-running" -> "طولانی‌مدت" or "پربیننده", "a vast, unseen audience" -> "مخاطبانی عظیم و نامرئی".
- Check agreement: singular with singular, plural with plural (never "یک تماشاگران"); keep the verb tense of the source.
- Use only real, idiomatic Persian words. If you are unsure that a word or collocation exists and sounds natural, choose a simpler common one -- never invent a word.
- Prefer plain, common vocabulary over heavy or bookish words; keep sentences short enough to read easily.

Reply with the Persian translation only: no preamble, notes, quotes, or the original text. Do not repeat the title/name line or any label such as "Film:", "Person:", "Synopsis:" or "Biography:"."""


# Original languages of the many obscure Chinese, Korean, Japanese, Indian,
# Thai, Arabic, Turkish... titles in the catalog: not worth paying to translate unless popular
# (settings.overview_translation_min_votes_asian).
LOW_PRIORITY_LANGUAGES = frozenset(
    {"zh", "cn", "ko", "ja", "th", "hi", "ta", "te", "ml", "kn", "bn", "mr", "pa", "gu", "id", "vi", "tl", "ms", "ar", "tr"}
)


def is_low_priority(attributes: dict) -> bool:
    """An obscure title in LOW_PRIORITY_LANGUAGES: skipped by the translation run."""
    if attributes.get("original_language") not in LOW_PRIORITY_LANGUAGES:
        return False
    votes = attributes.get("external_vote_count") or 0
    return votes < settings.overview_translation_min_votes_asian


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
    translating: it already has a Persian overview (from TMDb, an admin, or
    an up-to-date translation run), or has no overview at all. A machine
    translation made under an older TRANSLATION_VERSION counts as needing
    translation again; a manual (admin-written) overview never does. Titles
    synced before overview_en existed only have `overview`, which is English
    exactly when it has no Persian characters.
    """
    source = attributes.get("overview_source")
    if source in ("tmdb_fa", "manual"):
        return None
    if source == "machine":
        if (attributes.get("overview_translation_v") or 1) >= TRANSLATION_VERSION:
            return None
        return attributes.get("overview_en") or None
    if is_persian(attributes.get("overview")):
        return None
    return attributes.get("overview_en") or attributes.get("overview") or None


async def titles_needing_translation(db: AsyncSession) -> list[dict]:
    # Only the few attribute keys the selection needs, and only rows not
    # already Persian from TMDb / an admin: pulling every title's full
    # attributes over a remote connection hit the statement timeout.
    await db.execute(text("SET LOCAL statement_timeout = '300s'"))
    rows = await db.execute(
        text(
            "SELECT id, entity_type, title, jsonb_build_object("
            "'overview', attributes->'overview', 'overview_en', attributes->'overview_en', "
            "'overview_source', attributes->'overview_source', "
            "'overview_translation_v', attributes->'overview_translation_v', "
            "'original_language', attributes->'original_language', "
            "'external_vote_count', attributes->'external_vote_count', 'year', attributes->'year') "
            "FROM entities "
            "WHERE entity_type IN ('movie', 'tv_series') "
            "AND COALESCE(attributes->>'overview_source', '') NOT IN ('tmdb_fa', 'manual') "
            "ORDER BY (attributes->>'external_vote_count')::int DESC NULLS LAST"
        )
    )
    out = []
    for entity_id, entity_type, title, attributes in rows.all():
        if is_low_priority(attributes or {}):
            continue
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


# Some models echo the request header ("فیلم: Title (2017)" + a "خلاصه داستان:"
# label) before the translation; strip it, and the same for biographies.
_ECHO_HEADER = re.compile(r"^(?:فیلم|سریال|شخص|Film|TV series|Person)\s*[:：][^\n]*\n+[^\n:：]{1,30}[:：]\s*\n+")


def strip_prompt_echo(translated: str) -> str:
    return _ECHO_HEADER.sub("", translated, count=1).strip()


def translation_from_message(message) -> str | None:
    """The Persian text of a finished request, or None if it isn't usable."""
    if message.stop_reason != "end_turn":
        return None
    translated = strip_prompt_echo("".join(b.text for b in message.content if b.type == "text").strip())
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
    patch = {
        "overview": translated,
        "overview_en": source,
        "overview_source": "machine",
        "overview_translation_v": TRANSLATION_VERSION,
    }
    await db.execute(
        text("UPDATE entities SET attributes = attributes || CAST(:patch AS jsonb) WHERE id = :id"),
        {"id": entity_id, "patch": json.dumps(patch, ensure_ascii=False)},
    )
    return True


# ---- People biographies -------------------------------------------------
# Same batch mechanism as the overviews above, driven by
# scripts/translate_biographies.py. Only people with at least
# settings.biography_translation_min_works credited titles are translated;
# the rest keep their English biography.

BIOGRAPHY_TRANSLATION_VERSION = 1

BIOGRAPHY_SYSTEM_PROMPT = """You translate biographies of film and TV people (actors, directors, writers) from English into Persian (Farsi) for an Iranian movie website.

Write natural, fluent Persian the way a professional Iranian film magazine would -- not a word-for-word rendering. Keep the meaning and every fact of the original (dates, places, awards, works); do not add, summarize, or leave anything out. Keep paragraph breaks.

Keep the names of people (including the subject) and of fictional characters exactly as in the English text, in Latin script -- never transliterate them into Persian script. Well-known place names may be written in Persian (e.g. "Los Angeles" -> "لس‌آنجلس"). Titles of films and series that are well known in Iran by a Persian name use that name; otherwise keep the English title in Latin script.

Use Persian punctuation (، ؛ ؟ « ») and the zero-width non-joiner where standard Persian orthography calls for it (e.g. می‌شود).

Quality rules for the Persian:
- Never translate literally. Re-express each sentence the way a native writer would: "begins to realize" -> "کم‌کم پی می‌برد", "his entire existence" -> "تمام زندگی‌اش", "long-running" -> "طولانی‌مدت" or "پربیننده", "a vast, unseen audience" -> "مخاطبانی عظیم و نامرئی".
- Check agreement: singular with singular, plural with plural (never "یک تماشاگران"); keep the verb tense of the source.
- Use only real, idiomatic Persian words. If you are unsure that a word or collocation exists and sounds natural, choose a simpler common one -- never invent a word.
- Prefer plain, common vocabulary over heavy or bookish words; keep sentences short enough to read easily.

Reply with the Persian translation only: no preamble, notes, quotes, or the original text. Do not repeat the title/name line or any label such as "Film:", "Person:", "Synopsis:" or "Biography:"."""


def biography_source_text(attributes: dict) -> str | None:
    """The English biography still to translate, or None (already Persian from TMDb or up to date)."""
    source = attributes.get("biography_source")
    if source == "machine":
        if (attributes.get("biography_translation_v") or 1) >= BIOGRAPHY_TRANSLATION_VERSION:
            return None
        return attributes.get("biography_en") or None
    if source != "en":
        return None
    return attributes.get("biography_en") or None


async def people_needing_translation(db: AsyncSession) -> list[dict]:
    rows = await db.execute(
        text(
            "SELECT e.id, e.title, e.attributes FROM entities e "
            "JOIN person_stats s ON s.person_id = e.id AND s.role = 'all' AND s.origin = 'all' "
            "WHERE e.entity_type = 'person' AND s.works >= :min_works "
            "ORDER BY s.works DESC"
        ),
        {"min_works": settings.biography_translation_min_works},
    )
    out = []
    for entity_id, title, attributes in rows.all():
        source = biography_source_text(attributes or {})
        if source:
            out.append({"id": entity_id, "title": title, "source": source})
    return out


def build_biography_request(item: dict) -> Request:
    return Request(
        custom_id=make_custom_id(item["id"], item["source"]),
        params=MessageCreateParamsNonStreaming(
            model=settings.overview_translation_model,
            max_tokens=4096,
            system=BIOGRAPHY_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": f"Person: {item['title']}\n\nBiography:\n{item['source']}"}],
        ),
    )


async def apply_biography_translation(db: AsyncSession, entity_id: uuid.UUID, digest: str, translated: str) -> bool:
    """Writes one biography translation unless it is no longer needed or the English changed. Doesn't commit."""
    row = (
        await db.execute(text("SELECT attributes FROM entities WHERE id = :id"), {"id": entity_id})
    ).first()
    if row is None:
        return False
    source = biography_source_text(row[0] or {})
    if source is None or source_hash(source) != digest:
        return False
    patch = {
        "biography": translated,
        "biography_en": source,
        "biography_source": "machine",
        "biography_translation_v": BIOGRAPHY_TRANSLATION_VERSION,
    }
    await db.execute(
        text("UPDATE entities SET attributes = attributes || CAST(:patch AS jsonb) WHERE id = :id"),
        {"id": entity_id, "patch": json.dumps(patch, ensure_ascii=False)},
    )
    return True
