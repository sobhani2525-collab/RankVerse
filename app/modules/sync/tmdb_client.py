import asyncio
import httpx
from app.config import settings


class TMDbClient:
    def __init__(self):
        self.base_url = settings.tmdb_base_url
        self.api_key = settings.tmdb_api_key
        # One pooled client per TMDbClient (created lazily, inside the
        # running event loop) instead of a new connection + TLS handshake
        # per request -- the catalog import makes tens of thousands.
        self._http: httpx.AsyncClient | None = None

    def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=httpx.Timeout(20, connect=15))
        return self._http

    async def _get_with_retry(self, url: str, params: dict, max_retries: int = 4) -> dict:
        last_error = None
        for attempt in range(1, max_retries + 1):
            try:
                response = await self._client().get(url, params=params)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                # 429 (TMDb's ~50 req/s rate limit) and 5xx are worth
                # retrying; any other status (e.g. 404) is final.
                if e.response.status_code != 429 and e.response.status_code < 500:
                    raise
                last_error = e
            except httpx.TransportError as e:
                last_error = e
            if attempt < max_retries:
                wait_time = attempt * 2  # 2s, 4s, 6s backoff
                print(f"TMDb request failed (attempt {attempt}/{max_retries}), retrying in {wait_time}s: {last_error!r}")
                await asyncio.sleep(wait_time)
            else:
                print(f"TMDb request failed after {max_retries} attempts: {last_error!r}")
        raise last_error

    async def get_movie(self, tmdb_id: int, language: str = "en-US") -> dict:
        return await self._get_with_retry(
            f"{self.base_url}/movie/{tmdb_id}",
            params={"api_key": self.api_key, "append_to_response": "credits", "language": language},
        )

    async def discover_movies(
        self,
        page: int = 1,
        sort_by: str = "popularity.desc",
        with_origin_country: str | None = None,
        with_original_language: str | None = None,
        vote_count_gte: int | None = None,
        release_date_gte: str | None = None,
        release_date_lte: str | None = None,
    ) -> dict:
        params = {"api_key": self.api_key, "sort_by": sort_by, "page": page, "include_adult": "false"}
        if with_origin_country:
            params["with_origin_country"] = with_origin_country
        if with_original_language:
            params["with_original_language"] = with_original_language
        if vote_count_gte is not None:
            params["vote_count.gte"] = vote_count_gte
        if release_date_gte:
            params["primary_release_date.gte"] = release_date_gte
        if release_date_lte:
            params["primary_release_date.lte"] = release_date_lte
        return await self._get_with_retry(f"{self.base_url}/discover/movie", params=params)

    async def get_tv_series(self, tmdb_id: int, language: str = "en-US") -> dict:
        # aggregate_credits (not just credits) because TV directing is credited
        # per episode -- /tv/{id}/credits only has the latest season's
        # series-level crew, which is usually empty for Director.
        return await self._get_with_retry(
            f"{self.base_url}/tv/{tmdb_id}",
            params={
                "api_key": self.api_key,
                # external_ids for imdb_id -- unlike /movie/{id}, /tv/{id}
                # has no top-level imdb_id field.
                "append_to_response": "credits,aggregate_credits,external_ids",
                "language": language,
            },
        )

    async def discover_tv(
        self,
        page: int = 1,
        sort_by: str = "popularity.desc",
        with_origin_country: str | None = None,
        with_original_language: str | None = None,
        vote_count_gte: int | None = None,
        first_air_date_gte: str | None = None,
        first_air_date_lte: str | None = None,
    ) -> dict:
        params = {"api_key": self.api_key, "sort_by": sort_by, "page": page, "include_adult": "false"}
        if with_origin_country:
            params["with_origin_country"] = with_origin_country
        if with_original_language:
            params["with_original_language"] = with_original_language
        if vote_count_gte is not None:
            params["vote_count.gte"] = vote_count_gte
        if first_air_date_gte:
            params["first_air_date.gte"] = first_air_date_gte
        if first_air_date_lte:
            params["first_air_date.lte"] = first_air_date_lte
        return await self._get_with_retry(f"{self.base_url}/discover/tv", params=params)
