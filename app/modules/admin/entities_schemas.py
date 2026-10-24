import uuid

from pydantic import BaseModel, Field


class AdminEntityOverviewUpdate(BaseModel):
    # The Persian synopsis an admin wrote by hand (stored with
    # overview_source == "manual", which TMDb syncs and the machine
    # translation script never overwrite).
    overview: str = Field(min_length=1, max_length=5000)


class AdminEntityTrailerUpdate(BaseModel):
    # An Aparat link as the admin copied it: the watch page
    # (aparat.com/v/<hash>), the embed URL or iframe code, or the bare hash.
    url: str = Field(min_length=1, max_length=2000)


class AdminEntityOverviewRow(BaseModel):
    id: uuid.UUID
    entity_type: str
    title: str
    slug: str
    year: int | None = None
    vote_count: int | None = None
    # What the site shows, and the English source it was translated from.
    overview: str | None = None
    overview_en: str | None = None
    # "tmdb_fa" | "machine" | "manual" | "en" (untranslated) | None (no overview)
    overview_source: str | None = None
    # YouTube key from TMDb, and the Aparat hash an admin set.
    trailer_key: str | None = None
    aparat_trailer: str | None = None
