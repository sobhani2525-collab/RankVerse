"""
Fixed-window rate limiting for unauthenticated endpoints (register, login,
password reset).

Counts live in Redis so the limit holds across workers. When Redis is down
(or not provisioned) it falls back to a per-process counter instead of
failing open: the limit is then per worker, but a brute-force run is still
slowed down rather than unrestricted.
"""
import ipaddress
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


# Addresses of our own infrastructure (Liara's proxies, the container
# network, localhost). Hops from these are skipped when looking for the caller.
_INTERNAL_NETWORKS = tuple(
    ipaddress.ip_network(n)
    for n in (
        "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10",
        "127.0.0.0/8", "169.254.0.0/16", "::1/128", "fc00::/7", "fe80::/10",
    )
)


def _parse_ip(raw: str) -> ipaddress.IPv4Address | ipaddress.IPv6Address | None:
    try:
        return ipaddress.ip_address(raw.strip())
    except ValueError:
        return None


def _is_internal(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return any(ip in net for net in _INTERNAL_NETWORKS if net.version == ip.version)


def client_ip(request: Request) -> str:
    """Caller's IP, safe to rate-limit on.

    The client writes the left of X-Forwarded-For itself, so any value there
    can be forged; only the hops our proxies appended on the right are
    trustworthy. Walk the chain (plus the socket peer) from the right and
    take the first address that isn't our own infrastructure.
    """
    hops = [h for h in (request.headers.get("x-forwarded-for") or "").split(",") if h.strip()]
    if request.client and request.client.host:
        hops.append(request.client.host)
    for raw in reversed(hops):
        ip = _parse_ip(raw)
        if ip is not None and not _is_internal(ip):
            return str(ip)
    # Nothing public in the chain (local dev, tests): the nearest hop.
    return (hops[-1].strip() if hops else "unknown")[:64]


def forwarded_ip(request: Request) -> str | None:
    """The first X-Forwarded-For hop, i.e. the address the client claims.

    Forgeable, so never rate-limit on it. Only for the admin audit log: admin
    requests arrive through the Next.js proxy, which forwards the browser's
    chain, so client_ip() there would be the frontend server's address.
    """
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if not ip and request.client:
        ip = request.client.host
    return ip[:64] or None


def hit_local(key: str, window: int) -> int:
    """Counts one hit in this process's memory (the Redis-less fallback); returns the count in the current window."""
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
        return hit_local(key, window)


async def enforce(scope: str, identity: str, limit: int, window_seconds: int) -> None:
    """Counts one attempt for (scope, identity); raises RateLimitedError past `limit` per window."""
    count = await _hit(f"rl:{scope}:{identity.lower()}", window_seconds)
    if count > limit:
        raise RateLimitedError("تعداد تلاش‌ها زیاد است. کمی بعد دوباره امتحان کنید.")
