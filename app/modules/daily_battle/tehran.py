"""
Tehran calendar-day helpers. Iran has had no daylight saving since 1401, so a
fixed UTC+03:30 offset is exact -- and avoids depending on the tzdata package.
"""
from datetime import date, datetime, timedelta, timezone

TEHRAN_TZ = timezone(timedelta(hours=3, minutes=30))


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def tehran_today(now: datetime | None = None) -> date:
    return (now or utcnow()).astimezone(TEHRAN_TZ).date()


def seconds_until_next_day(now: datetime | None = None) -> int:
    """Whole seconds until the next Tehran midnight (always >= 1)."""
    local = (now or utcnow()).astimezone(TEHRAN_TZ)
    midnight = datetime.combine(local.date() + timedelta(days=1), datetime.min.time(), tzinfo=TEHRAN_TZ)
    return max(1, int((midnight - local).total_seconds()))
