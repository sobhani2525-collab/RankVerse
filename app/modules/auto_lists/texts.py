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


def publish_hour(day: date, slot: int = 0) -> int:
    """Tehran hour (9..20) from which `day`'s `slot`-th item (0-based) may be
    published; varies by date and slot so items don't all appear at the same
    minute every day."""
    return 9 + (day.toordinal() * 7 + slot * 4) % 12


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


# --- battles ("winner stays" pools) ---

_ACTOR_BATTLE_TITLES = [
    "کدوم فیلم {g} با بازی {p} بهتره؟",
    "نبرد فیلم" + ZWNJ + "های {g} با بازی {p}",
    "بهترین فیلم {g} با بازی {p} کدومه؟",
    "{p}؛ نبرد بهترین فیلم" + ZWNJ + "های {g}",
]
_ACTOR_BATTLE_DESCRIPTIONS = [
    "{n} فیلم {g} با بازی {p} رو دو به دو روبروی هم گذاشتم. شما انتخاب کنید کدوم بهتره تا برنده مشخص بشه.",
    "{p} تو ژانر {g} کارهای زیادی داره. اینجا {n} تاشون رو مقابل هم بذارید و ببینید کدوم می" + ZWNJ + "مونه.",
    "کدوم فیلم {g} با بازی {p} رو بیشتر دوست دارید؟ {n} فیلم، یک برنده.",
]
_DECADE_BATTLE_TITLES = [
    "کدوم {g} دهه {d} بهتره؟",
    "نبرد {g}" + ZWNJ + "های دهه {d} میلادی",
    "بهترین {g} دهه {d} رو انتخاب کنید",
]
_DECADE_BATTLE_DESCRIPTIONS = [
    "{n} فیلم {g} از دهه {d} میلادی. دو به دو انتخاب کنید تا ببینیم کدوم می‌مونه.",
    "دهه {d} برای ژانر {g} دهه خوبی بود. نظر شما برای بهترینش چیه؟",
    "{n} فیلم {g} دهه {d}، هر بار دو تا؛ برنده می‌مونه و بقیه می‌رن.",
]


def render_actor_battle(rng: random.Random, person: str, genre: str, n: int) -> tuple[str, str]:
    values = {"p": person, "g": genre, "n": fa_number(n)}
    return (
        rng.choice(_ACTOR_BATTLE_TITLES).format(**values),
        rng.choice(_ACTOR_BATTLE_DESCRIPTIONS).format(**values),
    )


def render_decade_battle(rng: random.Random, decade: int, genre: str, n: int) -> tuple[str, str]:
    values = {"d": decade_label(decade), "g": genre, "n": fa_number(n)}
    return (
        rng.choice(_DECADE_BATTLE_TITLES).format(**values),
        rng.choice(_DECADE_BATTLE_DESCRIPTIONS).format(**values),
    )


# --- series, mixed and people (the movie wording above stays as it was) ---

# work kind -> (singular, plural)
NOUNS = {
    "movie": ("فیلم", "فیلم" + ZWNJ + "های"),
    "tv_series": ("سریال", "سریال" + ZWNJ + "های"),
    "mixed": ("فیلم یا سریال", "فیلم" + ZWNJ + "ها و سریال" + ZWNJ + "های"),
}
_ROLE_NOUN = {"actor": "بازیگر", "director": "کارگردان", "creator": "سازنده"}

_W_ACTOR_TITLES = [
    "بهترین {wpl} {g} با بازی {p}",
    "{p} در {wpl} {g}؛ {n} انتخاب برتر",
    "{wpl} {g} که {p} توشون می" + ZWNJ + "درخشه",
]
_W_ACTOR_DESCRIPTIONS = [
    "از بین کارهای {p}، اینجا {n} عنوان {g} رو گذاشتم که بیشتر از بقیه دوستشون دارم. اگه چیزی رو جا انداختم خودتون اضافه کنید.",
    "{wpl} {g} با بازی {p} که به نظرم دیدنیه. ترتیبش رو با رأی دادن عوض کنید.",
    "اگه {p} رو دوست دارید و دنبال {w} {g} می" + ZWNJ + "گردید، از این {n} تا شروع کنید.",
]
_W_DECADE_TITLES = [
    "بهترین {wpl} {g} دهه {d} میلادی",
    "{wpl} {g} دهه {d}؛ {n} عنوان که ارزش دیدن دارن",
    "برترین {wpl} {g} دهه {d}",
]
_W_DECADE_DESCRIPTIONS = [
    "{n} عنوان {g} از دهه {d} میلادی که هنوز هم دیدنیه. اگه چیزی رو جا انداختم اضافه‌اش کنید.",
    "دهه {d} برای ژانر {g} دهه خوبی بود. این‌ها انتخاب‌های من از اون دوره‌ست.",
    "فهرستی از بهترین {wpl} {g} دهه {d} میلادی. ترتیبش رو با رأی دادن عوض کنید.",
]
_W_ACTOR_BATTLE_TITLES = [
    "کدوم {w} {g} با بازی {p} بهتره؟",
    "نبرد {wpl} {g} با بازی {p}",
    "بهترین {w} {g} با بازی {p} کدومه؟",
]
_W_ACTOR_BATTLE_DESCRIPTIONS = [
    "{n} {w} {g} با بازی {p} رو دو به دو روبروی هم گذاشتم. شما انتخاب کنید کدوم بهتره تا برنده مشخص بشه.",
    "{p} تو ژانر {g} کارهای زیادی داره. اینجا {n} تاشون رو مقابل هم بذارید و ببینید کدوم می" + ZWNJ + "مونه.",
    "کدوم {w} {g} با بازی {p} رو بیشتر دوست دارید؟ {n} عنوان، یک برنده.",
]
_W_DECADE_BATTLE_TITLES = [
    "کدوم {w} {g} دهه {d} بهتره؟",
    "نبرد {wpl} {g} دهه {d} میلادی",
    "بهترین {w} {g} دهه {d} رو انتخاب کنید",
]
_W_DECADE_BATTLE_DESCRIPTIONS = [
    "{n} {w} {g} از دهه {d} میلادی. دو به دو انتخاب کنید تا ببینیم کدوم می" + ZWNJ + "مونه.",
    "دهه {d} برای ژانر {g} دهه خوبی بود. نظر شما برای بهترینش چیه؟",
    "{n} {w} {g} دهه {d}، هر بار دو تا؛ برنده می" + ZWNJ + "مونه و بقیه می" + ZWNJ + "رن.",
]

_PEOPLE_GENRE_TITLES = {
    "actor": [
        "بهترین بازیگران ژانر {g}",
        "{n} بازیگر برتر ژانر {g}",
        "بازیگرهایی که {g} رو با اسمشون می" + ZWNJ + "شناسیم",
    ],
    "director": [
        "بهترین کارگردان" + ZWNJ + "های ژانر {g}",
        "{n} کارگردان برتر ژانر {g}",
        "کارگردان" + ZWNJ + "هایی که {g} رو به اوج رسوندن",
    ],
    "creator": [
        "بهترین سازنده" + ZWNJ + "های سریال" + ZWNJ + "های {g}",
        "{n} سازندهٔ برتر سریال" + ZWNJ + "های {g}",
    ],
}
_PEOPLE_ORIGIN_TITLES = {
    ("actor", "persian"): [
        "بازیگران ایرانی که کارهاشون رو دوست دارم",
        "بهترین بازیگران سینما و تلویزیون ایران",
        "{n} بازیگر ایرانی که باید دنبال کنید",
    ],
    ("director", "persian"): [
        "بهترین کارگردان" + ZWNJ + "های ایرانی",
        "{n} کارگردان ایرانی که فیلم" + ZWNJ + "هاشون دیدنیه",
    ],
    ("actor", "foreign"): [
        "بهترین بازیگران سینمای جهان",
        "{n} بازیگر خارجی که کارهاشون رو از دست ندید",
    ],
    ("director", "foreign"): [
        "بهترین کارگردان" + ZWNJ + "های سینمای جهان",
        "{n} کارگردان خارجی که باید فیلم" + ZWNJ + "هاشون رو دید",
    ],
}
_PEOPLE_DESCRIPTIONS = [
    "{n} {r} که به نظرم کارنامه" + ZWNJ + "شون خیلی خوبه. اگه کسی رو جا انداختم خودتون اضافه کنید.",
    "انتخاب‌های من از بین {r}" + ZWNJ + "هایی که کارهاشون رو دوست دارم؛ ترتیبش رو با رأی دادن عوض کنید.",
    "{n} {r} که کارهاشون رو دنبال می" + ZWNJ + "کنم. نظر شما چیه؟",
]


def _theme_values(theme, n: int) -> dict:
    w, wpl = NOUNS.get(theme.work, NOUNS["movie"])
    return {
        "w": w, "wpl": wpl, "n": fa_number(n), "g": theme.genre_fa or "",
        "p": theme.person_fa or "", "d": decade_label(theme.decade) if theme.decade else "",
        "r": _ROLE_NOUN.get(theme.role or "", ""),
    }


def render_list(rng: random.Random, theme) -> tuple[str, str]:
    """Title and description of a list for `theme` (see themes.Theme)."""
    n = len(theme.items)
    if theme.kind == "people":
        titles = (
            _PEOPLE_GENRE_TITLES[theme.role] if theme.genre_fa
            else _PEOPLE_ORIGIN_TITLES[(theme.role, theme.origin)]
        )
        v = _theme_values(theme, n)
        return rng.choice(titles).format(**v), rng.choice(_PEOPLE_DESCRIPTIONS).format(**v)
    if theme.work == "movie":  # the original movie wording
        if theme.kind == "actor":
            return render_actor_list(rng, theme.person_fa, theme.genre_fa, n)
        return render_decade_list(rng, theme.decade, theme.genre_fa, n)
    v = _theme_values(theme, n)
    if theme.kind == "actor":
        return rng.choice(_W_ACTOR_TITLES).format(**v), rng.choice(_W_ACTOR_DESCRIPTIONS).format(**v)
    return rng.choice(_W_DECADE_TITLES).format(**v), rng.choice(_W_DECADE_DESCRIPTIONS).format(**v)


def render_battle(rng: random.Random, theme, n: int) -> tuple[str, str]:
    """Title and description of a battle of `n` entrants for `theme`."""
    if theme.work == "movie":  # the original movie wording
        if theme.kind == "actor":
            return render_actor_battle(rng, theme.person_fa, theme.genre_fa, n)
        return render_decade_battle(rng, theme.decade, theme.genre_fa, n)
    v = _theme_values(theme, n)
    if theme.kind == "actor":
        return rng.choice(_W_ACTOR_BATTLE_TITLES).format(**v), rng.choice(_W_ACTOR_BATTLE_DESCRIPTIONS).format(**v)
    return rng.choice(_W_DECADE_BATTLE_TITLES).format(**v), rng.choice(_W_DECADE_BATTLE_DESCRIPTIONS).format(**v)
