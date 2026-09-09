import asyncio
import httpx

ITUNES_BASE_URL = "https://itunes.apple.com"


class ITunesClient:
    """No API key required — see https://performance-partners.apple.com/search-api"""

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
                    print(f"iTunes request failed (attempt {attempt}/{max_retries}), retrying in {wait_time}s: {e}")
                    await asyncio.sleep(wait_time)
                else:
                    print(f"iTunes request failed after {max_retries} attempts: {e}")
        raise last_error

    async def lookup_track(self, itunes_id: int) -> dict | None:
        """Fetch a single, known track by its iTunes id."""
        data = await self._get_with_retry(
            f"{ITUNES_BASE_URL}/lookup",
            params={"id": itunes_id, "entity": "song"},
        )
        results = data.get("results", [])
        return results[0] if results else None

    async def search_tracks(self, term: str, limit: int = 10) -> list[dict]:
        data = await self._get_with_retry(
            f"{ITUNES_BASE_URL}/search",
            params={"term": term, "media": "music", "entity": "song", "limit": limit},
        )
        return data.get("results", [])
