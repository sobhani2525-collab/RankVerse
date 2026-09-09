import uuid

from pydantic import BaseModel, ConfigDict


class MediaInfo(BaseModel):
    """Standard media shape every entity type maps its raw attributes into,
    so display components can key off presence of these fields rather than
    entity_type (a movie has image_url, a future song has audio_preview_url, etc.)."""
    image_url: str | None = None
    audio_preview_url: str | None = None
    video_url: str | None = None


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
    media: MediaInfo = MediaInfo()


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
    media: MediaInfo = MediaInfo()
    directed: list[MovieListItem] = []
    acted_in: list[MovieListItem] = []
    tracks: list[MovieListItem] = []
    albums: list[MovieListItem] = []


class GenreDetail(GenreSummary):
    description: str | None = None
    media: MediaInfo = MediaInfo()
    movies: list[MovieListItem] = []


class AlbumSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    slug: str
    title: str


class TrackDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    slug: str
    title: str
    media: MediaInfo = MediaInfo()
    artist: PersonSummary | None = None
    album: AlbumSummary | None = None
    other_tracks: list[MovieListItem] = []
