import uuid

from pydantic import BaseModel, ConfigDict


class PersonSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    slug: str
    title: str  # person's name, reuses Entity.title
    role: str | None = None  # 'director' | 'actor' (from edge metadata)


class GenreSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    slug: str
    title: str


class MovieListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    slug: str
    title: str
    poster_path: str | None = None
    year: int | None = None
    computed_score: float | None = None
    total_votes: int = 0


class MovieDetail(MovieListItem):
    overview: str | None = None
    runtime: int | None = None
    country: str | None = None
    directors: list[PersonSummary] = []
    cast: list[PersonSummary] = []
    genres: list[GenreSummary] = []


class MovieListResponse(BaseModel):
    items: list[MovieListItem]


class PersonDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    slug: str
    title: str
    biography: str | None = None
