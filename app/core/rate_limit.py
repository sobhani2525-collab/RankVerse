"""
Fixed-window rate limiting for unauthenticated endpoints (register, login,
password reset).

Counts live in Redis so the limit holds across workers. When Redis is down
(or not provisioned) it falls back to a per-process counter instead of
failing open: the limit is then per worker, but a brute-force run is still
slowed down rather than unrestricted.
"""
import logging
import time

from fastapi import Request
from redis.exceptions import RedisError

from app.core.exceptions import RateLimitedError
from app.core.redis import get_redis

logger = logging.getLogger(__name__)

# key -> (window_start, count); only used while Redis is unavailable.
_local: dict[str, tuple[float, int]] = {}
_LOCAL_MAX_KEYS = 10_000


def client_ip(request: Request) -> str:
    """Caller's IP: Cloudflare's header first, then the first X-Forwarded-For hop."""
    ip = request.headers.get("cf-connecting-ip") or (request.headers.get("x-forwarded-for") or "").split(",")[0]
    ip = ip.strip()
    if not ip and request.client:
        ip = request.client.host
    return (ip or "unknown")[:64]


def _hit_local(key: str, window: int) -> int:
    now = time.monotonic()
    if len(_local) > _LOCAL_MAX_KEYS:
        for k in [k for k, (start, _) in _local.items() if now - start >= window]:
            _local.pop(k, None)
        if len(_local) > _LOCAL_MAX_KEYS:
            _local.clear()
    start, count = _local.get(key, (now, 0))
    if now - start >= window:
        start, count = now, 0
    _local[key] = (start, count + 1)
    return count + 1


async def _hit(key: str, window: int) -> int:
    try:
        redis = await get_redis()
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, window)
        return count
    except (RedisError, OSError):
        logger.warning("Redis unavailable, using in-process rate limit for %s", key.split(":")[1])
        return _hit_local(key, window)


async def enforce(scope: str, identity: str, limit: int, window_seconds: int) -> None:
    """Counts one attempt for (scope, identity); raises RateLimitedError past `limit` per window."""
    count = await _hit(f"rl:{scope}:{identity.lower()}", window_seconds)
    if count > limit:
        raise RateLimitedError("تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید.")
