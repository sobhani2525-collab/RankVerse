"""Cache key for the public movie / TV series detail responses.

GET /movies/{slug} and /tv-series/{slug} are cached for a few minutes so a
crawl or a burst of visits doesn't open a DB connection per view. Admin edits
that change what the page shows (overview, watch links) drop the entry right
away -- in the worker that handled the edit; other workers catch up within
the TTL, since the cache is per process.
"""
from app.core.cache import cache

TITLE_TYPES = ("movie", "tv_series")


def title_detail_key(entity_type: str, slug: str) -> tuple[str, str, str]:
    return ("title-detail", entity_type, slug)


def invalidate_title_detail(entity_type: str, slug: str) -> None:
    if entity_type in TITLE_TYPES:
        cache.invalidate(title_detail_key(entity_type, slug))
