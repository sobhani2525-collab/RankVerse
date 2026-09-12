import asyncio
import httpx
from app.config import settings


class TMDbClient:
    def __init__(self):
        self.base_url = settings.tmdb_base_url
        self.api_key = settings.tmdb_api_key

    async def _get_with_retry(self, url: str, params: dict, max_retries: int = 3) -> dict:
        last_error = None
        for attempt in range(1, max_retries + 1):
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(url, params=params, timeout=15)
                    response.raise_for_status()
                    return response.json()
            except (httpx.ConnectError, httpx.ReadTimeout, httpx.RemoteProtocolError) as e:
                last_error = e
                if attempt < max_retries:
                    wait_time = attempt * 2  # 2s, 4s, 6s backoff
                    print(f"TMDb request failed (attempt {attempt}/{max_retries}), retrying in {wait_time}s: {e}")
                    await asyncio.sleep(wait_time)
                else:
                    print(f"TMDb request failed after {max_retries} attempts: {e}")
        raise last_error

    async def get_movie(self, tmdb_id: int) -> dict:
        return await self._get_with_retry(
            f"{self.base_url}/movie/{tmdb_id}",
            params={"api_key": self.api_key, "append_to_response": "credits"},
        )

    async def discover_movies(self, page: int = 1, sort_by: str = "popularity.desc") -> dict:
        return await self._get_with_retry(
            f"{self.base_url}/discover/movie",
            params={"api_key": self.api_key, "sort_by": sort_by, "page": page},
        )

    async def get_tv_series(self, tmdb_id: int) -> dict:
        return await self._get_with_retry(
            f"{self.base_url}/tv/{tmdb_id}",
            params={"api_key": self.api_key, "append_to_response": "credits"},
        )
