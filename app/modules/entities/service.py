from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.modules.entities.repository import EntityRepository
from app.modules.entities.schemas import (
    MovieDetail,
    MovieListItem,
    PersonSummary,
    GenreSummary,
)


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
        items = [
            MovieListItem(
                id=e.id,
                slug=e.slug,
                title=e.title,
                poster_path=e.attributes.get("poster_path"),
                year=e.attributes.get("year"),
                computed_score=e.ranking.computed_score if e.ranking else None,
                total_votes=e.ranking.total_votes if e.ranking else 0,
            )
            for e in entities
        ]
        return items, total

    async def get_movie_detail(self, slug: str) -> MovieDetail:
        entity = await self.repo.get_by_slug(slug, entity_type="movie")
        if not entity:
            raise NotFoundError(f"Movie '{slug}' not found")

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
            directors=directors,
            cast=cast,
            genres=genres,
        )
