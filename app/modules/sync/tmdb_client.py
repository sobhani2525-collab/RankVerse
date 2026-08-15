import httpx

from app.config import settings


class TMDbClient:
    def __init__(self):
        self.base_url = settings.tmdb_base_url
        self.api_key = settings.tmdb_api_key

    async def get_movie(self, tmdb_id: int) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/movie/{tmdb_id}",
                params={"api_key": self.api_key, "append_to_response": "credits"},
                timeout=15,
            )
            response.raise_for_status()
            return response.json()

    async def discover_movies(self, page: int = 1, sort_by: str = "popularity.desc") -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/discover/movie",
                params={"api_key": self.api_key, "sort_by": sort_by, "page": page},
                timeout=15,
            )
            response.raise_for_status()
            return response.json()
