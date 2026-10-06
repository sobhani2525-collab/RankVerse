from redis.asyncio import Redis, from_url

from app.config import settings

_redis: Redis | None = None


async def get_redis() -> Redis:
    """FastAPI dependency that returns a shared Redis client."""
    global _redis
    if _redis is None:
        # Short timeouts: with no (or an unreachable) Redis the callers fall
        # back to in-process counters, which must not cost a request seconds.
        _redis = from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
    return _redis
