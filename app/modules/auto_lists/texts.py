"""Persian wording for the daily auto-created lists.

Pure functions (no DB): titles and descriptions are picked from several
phrasings with a seeded RNG, so the same day always renders the same text but
different days don't all read like one template. Every number or name in the
text comes from the real list (genre, person, item count), never invented.
"""
import random
from datetime import date

ZWNJ = "‌"
_FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")

# Genre entity title (lower-cased) -> Persian noun used in titles.
GENRE_FA = {
    "action": "اکشن", "adventure": "ماجراجویی", "animation": "انیمیشن", "biography": "بیوگرافی",
    "comedy": "کمدی", "crime": "جنایی", "documentary": "مستند", "drama": "درام",
    "family": "خانوادگی", "fantasy": "فانتزی", "history": "تاریخی", "horror": "ترسناک",
    "music": "موسیقی", "mystery": "معمایی", "romance": "عاشقانه",
    "science fiction": "علمی‌تخیلی", "thriller": "هیجانی", "war": "جنگی", "western": "وسترن",
}


def fa_number(n: int) -> str:
    return str(n).translate(_FA_DIGITS)


def publish_hour(day: date) -> int:
    """Tehran hour (9..20) from which `day`'s list may be published; varies by
    date so lists don't all appear at the same minute every day."""
    return 9 + (day.toordinal() * 7) % 12


# {g} genre, {p} person, {n} item count, {d} decade.
_ACTOR_TITLES = [
    "بهترین فیلم‌های {g} با بازی {p}",
    "برترین {g}" + ZWNJ + "های {p}",
    "{p} در ژانر {g}؛ {n} فیلم برتر",
    "{p} و بهترین {g}" + ZWNJ + "هایش",
    "{g}" + ZWNJ + "هایی که با {p} یادموندنی شدن",
]
_ACTOR_DESCRIPTIONS = [
    "از بین کارهای {p}، اینجا {n} فیلم {g} رو گذاشتم که بیشتر از بقیه دوستشون دارم. اگه فیلمی رو جا انداختم خودتون اضافه کنید.",
    "فیلم‌های {g} با بازی {p} که به نظرم دیدنیه. ترتیبش رو با رأی‌هاتون عوض کنید.",
    "{p} تو ژانر {g} کارهای خوبی داشته. این {n} تا انتخاب منه، نظر شما چیه؟",
    "اگه {p} رو دوست دارید و سراغ فیلم {g} می‌گردید، از این فهرست شروع کنید.",
]

_DECADE_TITLES = [
    "بهترین {g}" + ZWNJ + "های دهه {d} میلادی",
    "{g}" + ZWNJ + "های دهه {d}؛ {n} فیلم که ارزش دیدن دارن",
    "برترین فیلم‌های {g} دهه {d}",
]
_DECADE_DESCRIPTIONS = [
    "{n} فیلم {g} از دهه {d} میلادی که هنوز هم دیدنیه. اگه فیلمی رو جا انداختم اضافه‌اش کنید.",
    "دهه {d} برای ژانر {g} دهه خوبی بود. این‌ها انتخاب‌های من از اون دوره‌ست.",
    "فهرستی از بهترین‌های {g} دهه {d} میلادی. ترتیبش رو با رأی دادن عوض کنید.",
]


def decade_label(decade: int) -> str:
    return fa_number(decade)


def render_actor_list(rng: random.Random, person: str, genre: str, n: int) -> tuple[str, str]:
    values = {"p": person, "g": genre, "n": fa_number(n)}
    return (
        rng.choice(_ACTOR_TITLES).format(**values),
        rng.choice(_ACTOR_DESCRIPTIONS).format(**values),
    )


def render_decade_list(rng: random.Random, decade: int, genre: str, n: int) -> tuple[str, str]:
    values = {"d": decade_label(decade), "g": genre, "n": fa_number(n)}
    return (
        rng.choice(_DECADE_TITLES).format(**values),
        rng.choice(_DECADE_DESCRIPTIONS).format(**values),
    )
