"""The streaming services a title can link to, and what a link to each must look like.

Links come from admins (one by one or CSV) and, later, from official partner
feeds. Whatever the source, a URL is only accepted when its host belongs to the
provider it is filed under, so the click-through redirect can never be turned
into an open redirect to an arbitrary site.
"""
from dataclasses import dataclass
from urllib.parse import urlsplit

from app.core.exceptions import ValidationError


@dataclass(frozen=True)
class Provider:
    key: str
    name: str  # Persian display name
    domains: tuple[str, ...]


# Display order on the page.
PROVIDERS: tuple[Provider, ...] = (
    Provider("filimo", "فیلیمو", ("filimo.com",)),
    Provider("namava", "نماوا", ("namava.ir",)),
    Provider("telewebion", "تلوبیون", ("telewebion.com", "telewebion.ir")),
    Provider("filmnet", "فیلم‌نت", ("filmnet.ir",)),
)
PROVIDER_BY_KEY = {p.key: p for p in PROVIDERS}
PROVIDER_ORDER = {p.key: i for i, p in enumerate(PROVIDERS)}

ACCESS_TYPES = {"subscription": "اشتراکی", "rent": "خرید یا اجاره", "free": "رایگان"}

MAX_URL_LENGTH = 1000


def validate_link(provider: str, url: str, access_type: str) -> str:
    """Returns the cleaned URL, or raises ValidationError."""
    spec = PROVIDER_BY_KEY.get(provider)
    if spec is None:
        raise ValidationError(f"سرویس «{provider}» پشتیبانی نمی‌شود")
    if access_type not in ACCESS_TYPES:
        raise ValidationError(f"نوع دسترسی «{access_type}» معتبر نیست")
    url = (url or "").strip()
    if not url or len(url) > MAX_URL_LENGTH:
        raise ValidationError("نشانی لینک خالی یا بیش از حد بلند است")
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname:
        raise ValidationError("لینک باید با https شروع شود")
    if parts.username or parts.password:
        raise ValidationError("لینک نباید شامل نام کاربری یا رمز باشد")
    host = parts.hostname.lower()
    if not any(host == d or host.endswith("." + d) for d in spec.domains):
        raise ValidationError(f"دامنهٔ لینک با {spec.name} نمی‌خواند ({', '.join(spec.domains)})")
    return url
