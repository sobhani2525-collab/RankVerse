from redis.asyncio import Redis, from_url

from app.config import settings

_redis: Redis | None = None


async def get_redis() -> Redis:
    """FastAPI dependency that returns a shared Redis client."""
    global _redis
    if _redis is None:
        _redis = from_url(settings.redis_url, decode_responses=True)
    return _redis
