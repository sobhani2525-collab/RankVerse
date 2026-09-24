"""
Enumerates TMDb's catalog (movie or tv) above a vote-count floor, for
scripts/import_tmdb_catalog.py.

TMDb's /discover endpoints stop serving results after page 500 (10,000
titles per query) -- and even total_results is capped -- so a query like
"every movie with >= 100 votes" (~23k titles) can't be paged straight
through. discover_catalog_ids splits the release-date range in half,
recursively, until every slice fits under that limit, then pages each
slice. Slices are disjoint (split at a day boundary), so no title is
seen twice except via TMDb's own occasional reordering between pages,
which the returned dict dedupes.
"""
import asyncio
import logging
from datetime import date, timedelta

from app.modules.sync.tmdb_client import TMDbClient

logger = logging.getLogger(__name__)

TMDB_MAX_PAGES = 500
CATALOG_START = date(1874, 1, 1)  # earliest dated entries on TMDb


async def _discover_page(
    client: TMDbClient, kind: str, min_votes: int, start: date, end: date, page: int, filters: dict
) -> dict:
    if kind == "movie":
        return await client.discover_movies(
            page=page,
            sort_by="vote_count.desc",
            vote_count_gte=min_votes,
            release_date_gte=start.isoformat(),
            release_date_lte=end.isoformat(),
            **filters,
        )
    return await client.discover_tv(
        page=page,
        sort_by="vote_count.desc",
        vote_count_gte=min_votes,
        first_air_date_gte=start.isoformat(),
        first_air_date_lte=end.isoformat(),
        **filters,
    )


async def discover_catalog_ids(
    kind: str,
    min_votes: int,
    exclude_languages: frozenset[str] = frozenset({"fa"}),
    end: date | None = None,
    concurrency: int = 8,
    filters: dict | None = None,
) -> dict[int, dict]:
    """
    Returns {tmdb_id: {"vote_count": ..., "original_language": ...}} for
    every `kind` ("movie" or "tv") title with vote_count >= min_votes whose
    original_language isn't in exclude_languages. Farsi-language titles are
    excluded by default because they're imported separately (see
    discover_iranian_ids). filters are extra discover params (e.g.
    with_origin_country) applied to every request.
    """
    filters = filters or {}
    if kind not in ("movie", "tv"):
        raise ValueError(f"kind must be 'movie' or 'tv', got {kind!r}")
    client = TMDbClient()
    end = end or date.today() + timedelta(days=365)
    semaphore = asyncio.Semaphore(concurrency)
    found: dict[int, dict] = {}

    async def fetch(start: date, stop: date, page: int) -> dict:
        async with semaphore:
            return await _discover_page(client, kind, min_votes, start, stop, page, filters)

    async def walk(start: date, stop: date) -> None:
        first = await fetch(start, stop, 1)
        total_pages = first.get("total_pages", 0)
        # total_results is capped too, so a full 500 pages is treated as
        # "possibly truncated" and split, unless the slice is a single day.
        if total_pages >= TMDB_MAX_PAGES and start < stop:
            mid = start + (stop - start) // 2
            await asyncio.gather(walk(start, mid), walk(mid + timedelta(days=1), stop))
            return
        if total_pages >= TMDB_MAX_PAGES:
            logger.warning("%s slice %s has >= %d pages; titles past page 500 are skipped", kind, start, TMDB_MAX_PAGES)
        pages = [first] + await asyncio.gather(
            *(fetch(start, stop, p) for p in range(2, min(total_pages, TMDB_MAX_PAGES) + 1))
        )
        for page in pages:
            for item in page.get("results", []):
                if item.get("original_language") in exclude_languages:
                    continue
                found[item["id"]] = {
                    "vote_count": item.get("vote_count"),
                    "original_language": item.get("original_language"),
                }

    await walk(CATALOG_START, end)
    return found


async def discover_iranian_ids(kind: str, min_votes: int) -> dict[int, dict]:
    """
    Iranian titles: Farsi-language OR produced in Iran. TMDb's discover
    ANDs its filters, so (like SyncService.bulk_sync_iranian) the two are
    queried separately and merged -- this catches Farsi titles made abroad
    and Iranian productions in another language.
    """
    by_language = await discover_catalog_ids(
        kind, min_votes, exclude_languages=frozenset(), filters={"with_original_language": "fa"}
    )
    by_country = await discover_catalog_ids(
        kind, min_votes, exclude_languages=frozenset(), filters={"with_origin_country": "IR"}
    )
    return {**by_country, **by_language}
