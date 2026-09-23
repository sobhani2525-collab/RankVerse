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
    # Persian title from TMDb's fa-IR translation, when it has one distinct
    # from the English title (see sync/normalizer.py's _persian_title) --
    # None for anything not yet re-synced, or with no Persian translation
    # available. Display components compose "{title_fa} ({title})" when set.
    title_fa: str | None = None
    entity_type: str = "movie"
    poster_path: str | None = None
    year: int | None = None
    computed_score: float | None = None
    total_votes: int = 0
    media: MediaInfo = MediaInfo()


class ImdbInfo(BaseModel):
    # Written by scripts/sync_imdb_ratings.py from IMDb's ratings dataset;
    # imdb_id comes from TMDb at sync time. All three can be missing.
    imdb_id: str | None = None
    imdb_rating: float | None = None
    imdb_votes: int | None = None


class MovieDetail(MovieListItem, ImdbInfo):
    overview: str | None = None
    runtime: int | None = None
    country: str | None = None
    directors: list[PersonSummary] = []
    cast: list[PersonSummary] = []
    genres: list[GenreSummary] = []


class TVSeriesDetail(MovieListItem, ImdbInfo):
    entity_type: str = "tv_series"
    overview: str | None = None
    number_of_seasons: int | None = None
    number_of_episodes: int | None = None
    status: str | None = None
    first_air_date: str | None = None
    last_air_date: str | None = None
    country: str | None = None
    creators: list[PersonSummary] = []
    directors: list[PersonSummary] = []
    cast: list[PersonSummary] = []
    genres: list[GenreSummary] = []
    networks: list[GenreSummary] = []


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
    created: list[MovieListItem] = []
    acted_in: list[MovieListItem] = []
    tracks: list[MovieListItem] = []
    albums: list[MovieListItem] = []


class GenreDetail(GenreSummary):
    description: str | None = None
    media: MediaInfo = MediaInfo()
    movies: list[MovieListItem] = []
    tv_series: list[MovieListItem] = []


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
