import uuid
from datetime import datetime

from pydantic import BaseModel


class SeoSitemap(BaseModel):
    """URLs each sitemap file group lists (same filters as /sitemap/*)."""

    movie: int
    tv_series: int
    person: int  # only people with at least one credit
    genre: int
    lists: int  # public, non-empty, not hidden from discovery


class SeoTitleContent(BaseModel):
    """Gaps that weaken a movie or series page in search results."""

    total: int
    missing_title_fa: int
    missing_overview_fa: int  # no overview, or only the untranslated English one
    machine_overview: int  # machine-translated: readable, but worth a human pass on popular titles
    missing_poster: int  # no og:image / large preview


class SeoPeopleContent(BaseModel):
    total: int
    without_credits: int  # left out of the sitemap
    missing_biography: int  # noindexed unless they have 3+ credits
    english_biography: int


class SeoLists(BaseModel):
    indexable: int
    empty_public: int  # noindex until something is added
    hidden: int  # hidden from discovery by an admin
    private: int


class SeoBattles(BaseModel):
    public: int  # listed and indexable
    unlisted: int  # reachable by link, noindex
    hidden: int  # public but hidden from discovery by an admin


class SeoGap(BaseModel):
    id: uuid.UUID
    entity_type: str
    title: str
    slug: str
    year: int | None = None
    vote_count: int | None = None
    missing: list[str]  # title_fa | overview_fa | poster


class AdminSeoOverview(BaseModel):
    sitemap: SeoSitemap
    movies: SeoTitleContent
    tv_series: SeoTitleContent
    people: SeoPeopleContent
    lists: SeoLists
    battles: SeoBattles
    # Most-voted titles with a gap: the pages that most need fixing first.
    gaps: list[SeoGap]
    generated_at: datetime
