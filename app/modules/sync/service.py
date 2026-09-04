from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.entities.repository import EntityRepository
from app.modules.ranking.service import RankingService
from app.modules.sync.normalizer import normalize_movie
from app.modules.sync.tmdb_client import TMDbClient


class SyncService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = EntityRepository(db)
        self.client = TMDbClient()

    async def _get_or_create_person(self, external_id: str, name: str):
        person = await self.repo.get_by_external_id("tmdb_person", external_id)
        if not person:
            from slugify import slugify
            person = await self.repo.create_entity(
                entity_type="person",
                external_id=external_id,
                external_source="tmdb_person",
                title=name,
                slug=f"{slugify(name)}-{external_id}",
                attributes={},
            )
        return person

    async def _get_or_create_genre(self, external_id: str, name: str):
        genre = await self.repo.get_by_external_id("tmdb_genre", external_id)
        if not genre:
            from slugify import slugify
            genre = await self.repo.create_entity(
                entity_type="genre",
                external_id=external_id,
                external_source="tmdb_genre",
                title=name,
                slug=slugify(name),
                attributes={},
            )
        return genre

    async def sync_movie(self, tmdb_id: int) -> dict:
        raw = await self.client.get_movie(tmdb_id)
        normalized = normalize_movie(raw)

        movie = await self.repo.get_by_external_id("tmdb", normalized["external_id"])
        if movie:
            movie.title = normalized["title"]
            movie.attributes = normalized["attributes"]
        else:
            # هم external_id و هم slug رو چک کن، چون ممکنه slug از یه منبع دیگه از قبل ساخته شده باشه
            existing_by_slug = await self.repo.get_by_slug(normalized["slug"])
            if existing_by_slug:
                movie = existing_by_slug
                movie.external_id = normalized["external_id"]
                movie.external_source = "tmdb"
                movie.title = normalized["title"]
                movie.attributes = normalized["attributes"]
            else:
                movie = await self.repo.create_entity(
                    entity_type="movie",
                    external_id=normalized["external_id"],
                    external_source="tmdb",
                    title=normalized["title"],
                    slug=normalized["slug"],
                    attributes=normalized["attributes"],
                )
 

        for d in normalized["directors"]:
            person = await self._get_or_create_person(d["external_id"], d["name"])
            await self.repo.create_relationship(movie.id, person.id, "directed_by")

        for c in normalized["cast"]:
            person = await self._get_or_create_person(c["external_id"], c["name"])
            await self.repo.create_relationship(
                movie.id, person.id, "acted_in",
                edge_metadata={"character": c["character"], "order": c["order"]},
            )

        for g in normalized["genres"]:
            genre = await self._get_or_create_genre(g["external_id"], g["name"])
            await self.repo.create_relationship(movie.id, genre.id, "has_genre")

        ranking_service = RankingService(self.db)
        await ranking_service.recompute_entity(movie)

        await self.db.commit()
        return {"id": str(movie.id), "slug": movie.slug, "title": movie.title}

    async def bulk_sync_popular(self, pages: int = 5) -> int:
        """Pulls several pages of popular movies from TMDb discover endpoint."""
        synced = 0
        for page in range(1, pages + 1):
            discover = await self.client.discover_movies(page=page)
            for movie in discover.get("results", []):
                await self.sync_movie(movie["id"])
                synced += 1
        return synced
