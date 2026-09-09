from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.entities.repository import EntityRepository
from app.modules.entities.schemas import (
    MediaInfo,
    MovieDetail,
    MovieListItem,
    PersonDetail,
    PersonSummary,
    GenreDetail,
    GenreSummary,
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
    ) -> tuple[list[MovieListItem], int]:
        entities, total = await self.repo.list_movies(
            page, page_size, genre_slug, year_from, year_to, sort_by
        )
        return [_movie_list_item(e) for e in entities], total

    async def get_movie_entity(self, slug: str):
        entity = await self.repo.get_by_slug(slug, entity_type="movie")
        if not entity:
            raise NotFoundError(f"Movie '{slug}' not found")
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

    async def get_person_detail(self, slug: str) -> PersonDetail:
        entity = await self.repo.get_by_slug(slug, entity_type="person")
        if not entity:
            raise NotFoundError(f"Person '{slug}' not found")

        directed_edges = await self.repo.get_incoming_relationships(entity.id, "directed_by")
        acted_in_edges = await self.repo.get_incoming_relationships(entity.id, "acted_in")

        return PersonDetail(
            id=entity.id,
            slug=entity.slug,
            title=entity.title,
            biography=entity.attributes.get("biography"),
            media=_extract_media(entity.attributes),
            directed=sorted(
                (_movie_list_item(e.from_entity) for e in directed_edges), key=_by_score_desc
            ),
            acted_in=sorted(
                (_movie_list_item(e.from_entity) for e in acted_in_edges), key=_by_score_desc
            ),
        )

    async def get_genre_detail(self, slug: str) -> GenreDetail:
        entity = await self.repo.get_by_slug(slug, entity_type="genre")
        if not entity:
            raise NotFoundError(f"Genre '{slug}' not found")

        movies, _ = await self.list_movies(page=1, page_size=50, genre_slug=slug, sort_by="score")

        return GenreDetail(
            id=entity.id,
            slug=entity.slug,
            title=entity.title,
            description=entity.attributes.get("description"),
            media=_extract_media(entity.attributes),
            movies=movies,
        )
