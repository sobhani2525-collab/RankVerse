import uuid
from typing import Literal

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


class AwardInput(BaseModel):
    award: str = Field(min_length=1, max_length=40)       # key from entities/awards.py AWARDS
    category: str = Field(min_length=1, max_length=200)   # e.g. "Best Director"
    year: int = Field(ge=1900, le=2100)
    status: Literal["won", "nominated"]
    for_entity_id: uuid.UUID | None = None                # person awards: the title it was for


class AdminEntityCreate(BaseModel):
    # A title or person added by hand (external_source="manual").
    entity_type: Literal["movie", "tv_series", "person"]
    title: str = Field(min_length=1, max_length=500)  # original / Latin name
    title_fa: str | None = Field(None, max_length=500)
    year: int | None = Field(None, ge=1850, le=2100)  # release year, or birth year for a person
    overview: str | None = Field(None, max_length=5000)  # Persian synopsis / biography
    image_url: str | None = Field(None, max_length=1000)  # poster or photo (https)
    # Titles only (ignored for a person):
    imdb_id: str | None = Field(None, pattern=r"^tt\d{5,10}$")
    original_language: str | None = Field(None, pattern=r"^[a-z]{2,3}$")  # ISO 639-1, e.g. fa, en
    country: str | None = Field(None, pattern=r"^[A-Za-z]{2}$")            # ISO 3166-1 alpha-2, e.g. IR
    runtime: int | None = Field(None, ge=1, le=1000)                        # movie, minutes
    release_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")  # movie release / series first air
    last_air_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    number_of_seasons: int | None = Field(None, ge=1, le=200)
    number_of_episodes: int | None = Field(None, ge=1, le=20000)
    status: Literal["Returning Series", "Ended", "Canceled", "In Production"] | None = None
    youtube_trailer_key: str | None = Field(None, pattern=r"^[A-Za-z0-9_-]{6,20}$")
    aparat_trailer_url: str | None = Field(None, max_length=2000)
    genre_ids: list[uuid.UUID] = Field(default_factory=list, max_length=20)
    awards: list[AwardInput] = Field(default_factory=list, max_length=50)  # titles and people


class AdminEntityOverviewRow(BaseModel):
    id: uuid.UUID
    entity_type: str
    title: str
    title_fa: str | None = None
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
