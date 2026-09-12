from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.entities.repository import EntityRepository
from app.modules.entities.schemas import (
    AlbumSummary,
    MediaInfo,
    MovieDetail,
    MovieListItem,
    PersonDetail,
    PersonSummary,
    GenreDetail,
    GenreSummary,
    TrackDetail,
    TVSeriesDetail,
)

TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500"


def _extract_media(attributes: dict) -> MediaInfo:
    """
    Maps whatever an entity's raw, source-specific attributes hold into the
    standard media shape. New sync sources should write attributes["media"]
    directly; the poster_path fallback exists only for movies ingested
    before that became the standard (see sync/normalizer.py).
    """
    media = attributes.get("media") or {}
    image_url = media.get("image_url")
    if not image_url and attributes.get("poster_path"):
        image_url = f"{TMDB_IMAGE_BASE}{attributes['poster_path']}"
    return MediaInfo(
        image_url=image_url,
        audio_preview_url=media.get("audio_preview_url"),
        video_url=media.get("video_url"),
    )


def _movie_list_item(entity) -> MovieListItem:
    return MovieListItem(
        id=entity.id,
        slug=entity.slug,
        title=entity.title,
        entity_type=entity.entity_type,
        poster_path=entity.attributes.get("poster_path"),
        year=entity.attributes.get("year"),
        computed_score=entity.ranking.computed_score if entity.ranking else None,
        total_votes=entity.ranking.total_votes if entity.ranking else 0,
        media=_extract_media(entity.attributes),
    )


def _by_score_desc(item: MovieListItem):
    """Sort key matching computed_score DESC NULLS LAST, the same ordering
    ranking/service.py's RANK() query and list_movies() use everywhere else."""
    return (item.computed_score is None, -(item.computed_score or 0))


class EntityService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = EntityRepository(db)

    async def list_movies(
        self,
        page: int = 1,
        page_size: int = 20,
        genre_slug: str | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        sort_by: str = "score",
        entity_type: str = "movie",
    ) -> tuple[list[MovieListItem], int]:
        entities, total = await self.repo.list_movies(
            page, page_size, genre_slug, year_from, year_to, sort_by, entity_type
        )
        return [_movie_list_item(e) for e in entities], total

    async def list_tv_series(
        self,
        page: int = 1,
        page_size: int = 20,
        genre_slug: str | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        sort_by: str = "score",
    ) -> tuple[list[MovieListItem], int]:
        """Mirrors list_movies for entity_type='tv_series' -- MovieListItem's
        fields (title/poster/year/score/votes/media) are generic enough to
        reuse as-is rather than duplicating the shape under a new name."""
        return await self.list_movies(page, page_size, genre_slug, year_from, year_to, sort_by, "tv_series")

    async def get_movie_entity(self, slug: str):
        entity = await self.repo.get_by_slug(slug, entity_type="movie")
        if not entity:
            raise NotFoundError(f"Movie '{slug}' not found")
        return entity

    async def get_tv_series_entity(self, slug: str):
        entity = await self.repo.get_by_slug(slug, entity_type="tv_series")
        if not entity:
            raise NotFoundError(f"TV series '{slug}' not found")
        return entity

    async def get_movie_detail(self, slug: str) -> MovieDetail:
        entity = await self.get_movie_entity(slug)

        director_edges = await self.repo.get_relationships(entity.id, "directed_by")
        cast_edges = await self.repo.get_relationships(entity.id, "acted_in")
        genre_edges = await self.repo.get_relationships(entity.id, "has_genre")

        directors = [
            PersonSummary(id=e.to_entity.id, slug=e.to_entity.slug, title=e.to_entity.title, role="director")
            for e in director_edges
        ]
        cast = [
            PersonSummary(
                id=e.to_entity.id,
                slug=e.to_entity.slug,
                title=e.to_entity.title,
                role=e.edge_metadata.get("character"),
            )
            for e in sorted(cast_edges, key=lambda e: e.edge_metadata.get("order", 99))
        ]
        genres = [
            GenreSummary(id=e.to_entity.id, slug=e.to_entity.slug, title=e.to_entity.title)
            for e in genre_edges
        ]

        return MovieDetail(
            id=entity.id,
            slug=entity.slug,
            title=entity.title,
            poster_path=entity.attributes.get("poster_path"),
            year=entity.attributes.get("year"),
            overview=entity.attributes.get("overview"),
            runtime=entity.attributes.get("runtime"),
            country=entity.attributes.get("country"),
            computed_score=entity.ranking.computed_score if entity.ranking else None,
            total_votes=entity.ranking.total_votes if entity.ranking else 0,
            media=_extract_media(entity.attributes),
            directors=directors,
            cast=cast,
            genres=genres,
        )

    async def get_tv_series_detail(self, slug: str) -> TVSeriesDetail:
        """Mirrors get_movie_detail -- same edge types (has_genre/acted_in),
        plus 'creator' (tv_series' equivalent of directed_by, see
        sync/normalizer.py) and 'aired_on' (networks) which movies don't have."""
        entity = await self.get_tv_series_entity(slug)

        creator_edges = await self.repo.get_relationships(entity.id, "creator")
        director_edges = await self.repo.get_relationships(entity.id, "directed_by")
        cast_edges = await self.repo.get_relationships(entity.id, "acted_in")
        genre_edges = await self.repo.get_relationships(entity.id, "has_genre")
        network_edges = await self.repo.get_relationships(entity.id, "aired_on")

        creators = [
            PersonSummary(id=e.to_entity.id, slug=e.to_entity.slug, title=e.to_entity.title, role="creator")
            for e in creator_edges
        ]
        directors = [
            PersonSummary(id=e.to_entity.id, slug=e.to_entity.slug, title=e.to_entity.title, role="director")
            for e in director_edges
        ]
        cast = [
            PersonSummary(
                id=e.to_entity.id,
                slug=e.to_entity.slug,
                title=e.to_entity.title,
                role=e.edge_metadata.get("character"),
            )
            for e in sorted(cast_edges, key=lambda e: e.edge_metadata.get("order", 99))
        ]
        genres = [
            GenreSummary(id=e.to_entity.id, slug=e.to_entity.slug, title=e.to_entity.title)
            for e in genre_edges
        ]
        networks = [
            GenreSummary(id=e.to_entity.id, slug=e.to_entity.slug, title=e.to_entity.title)
            for e in network_edges
        ]

        return TVSeriesDetail(
            id=entity.id,
            slug=entity.slug,
            title=entity.title,
            poster_path=entity.attributes.get("poster_path"),
            year=entity.attributes.get("year"),
            overview=entity.attributes.get("overview"),
            number_of_seasons=entity.attributes.get("number_of_seasons"),
            number_of_episodes=entity.attributes.get("number_of_episodes"),
            status=entity.attributes.get("status"),
            first_air_date=entity.attributes.get("first_air_date"),
            last_air_date=entity.attributes.get("last_air_date"),
            country=entity.attributes.get("country"),
            computed_score=entity.ranking.computed_score if entity.ranking else None,
            total_votes=entity.ranking.total_votes if entity.ranking else 0,
            media=_extract_media(entity.attributes),
            creators=creators,
            directors=directors,
            cast=cast,
            genres=genres,
            networks=networks,
        )

    async def get_person_detail(self, slug: str) -> PersonDetail:
        entity = await self.repo.get_by_slug(slug, entity_type="person")
        if not entity:
            raise NotFoundError(f"Person '{slug}' not found")

        directed_edges = await self.repo.get_incoming_relationships(entity.id, "directed_by")
        # 'creator' is tv_series' equivalent of directed_by (see sync/normalizer.py's
        # created_by handling) -- kept as its own field rather than merged into
        # `directed` since "directed" and "created" are different roles and a person
        # could plausibly have both (a movie director who also created a show).
        created_edges = await self.repo.get_incoming_relationships(entity.id, "creator")
        acted_in_edges = await self.repo.get_incoming_relationships(entity.id, "acted_in")
        performed_by_edges = await self.repo.get_incoming_relationships(entity.id, "performed_by")

        return PersonDetail(
            id=entity.id,
            slug=entity.slug,
            title=entity.title,
            biography=entity.attributes.get("biography"),
            media=_extract_media(entity.attributes),
            directed=sorted(
                (_movie_list_item(e.from_entity) for e in directed_edges), key=_by_score_desc
            ),
            created=sorted(
                (_movie_list_item(e.from_entity) for e in created_edges), key=_by_score_desc
            ),
            acted_in=sorted(
                (_movie_list_item(e.from_entity) for e in acted_in_edges), key=_by_score_desc
            ),
            tracks=sorted(
                (
                    _movie_list_item(e.from_entity)
                    for e in performed_by_edges
                    if e.from_entity.entity_type == "track"
                ),
                key=_by_score_desc,
            ),
            albums=sorted(
                (
                    _movie_list_item(e.from_entity)
                    for e in performed_by_edges
                    if e.from_entity.entity_type == "album"
                ),
                key=_by_score_desc,
            ),
        )

    async def get_genre_detail(self, slug: str) -> GenreDetail:
        entity = await self.repo.get_by_slug(slug, entity_type="genre")
        if not entity:
            raise NotFoundError(f"Genre '{slug}' not found")

        movies, _ = await self.list_movies(page=1, page_size=50, genre_slug=slug, sort_by="score")
        tv_series, _ = await self.list_tv_series(page=1, page_size=50, genre_slug=slug, sort_by="score")

        return GenreDetail(
            id=entity.id,
            slug=entity.slug,
            title=entity.title,
            description=entity.attributes.get("description"),
            media=_extract_media(entity.attributes),
            movies=movies,
            tv_series=tv_series,
        )

    async def get_track_detail(self, slug: str) -> TrackDetail:
        entity = await self.repo.get_by_slug(slug, entity_type="track")
        if not entity:
            raise NotFoundError(f"Track '{slug}' not found")

        artist_edges = await self.repo.get_relationships(entity.id, "performed_by")
        album_edges = await self.repo.get_relationships(entity.id, "part_of")

        artist = None
        other_tracks: list[MovieListItem] = []
        if artist_edges:
            artist_entity = artist_edges[0].to_entity
            artist = PersonSummary(
                id=artist_entity.id, slug=artist_entity.slug, title=artist_entity.title, role="artist"
            )
            other_edges = await self.repo.get_incoming_relationships(artist_entity.id, "performed_by")
            other_tracks = sorted(
                (
                    _movie_list_item(e.from_entity)
                    for e in other_edges
                    if e.from_entity.entity_type == "track" and e.from_entity.id != entity.id
                ),
                key=_by_score_desc,
            )

        album = None
        if album_edges:
            album_entity = album_edges[0].to_entity
            album = AlbumSummary(id=album_entity.id, slug=album_entity.slug, title=album_entity.title)

        return TrackDetail(
            id=entity.id,
            slug=entity.slug,
            title=entity.title,
            media=_extract_media(entity.attributes),
            artist=artist,
            album=album,
            other_tracks=other_tracks,
        )
