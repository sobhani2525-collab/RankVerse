"""Title similarity for "this list may already exist" hints on the new-list form.

Pure functions (no DB): normalise Persian text, reduce a title to its content
words (dropping generic ones like «بهترین» / «فیلم» / «های», which nearly every
list title has), and score two titles by word overlap."""
import re

_CHAR_MAP = str.maketrans({"ي": "ی", "ك": "ک", "ة": "ه", "‌": " ", "‌": " "})
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_WORD = re.compile(r"[\w]+", re.UNICODE)

# Words every list title is full of; two lists sharing only these aren't alike.
_GENERIC = {
    "بهترین", "برترین", "بهتر", "برتر", "فیلم", "سریال", "انیمه", "انیمیشن", "لیست", "فهرست", "مجموعه",
    "از", "در", "و", "به", "با", "که", "برای", "را", "این", "آن", "یا", "من", "ما", "های", "ها",
    "top", "best", "movies", "movie", "films", "film", "series", "list", "of", "the", "and",
}

# Content kinds: «سریال‌های X» and «انیمه‌های X» are different lists even though
# these words are otherwise ignored.
_KINDS = {"فیلم", "سریال", "انیمه", "انیمیشن"}

SIMILARITY_THRESHOLD = 0.5


def normalize(text: str) -> str:
    return " ".join(_WORD.findall(text.translate(_CHAR_MAP).translate(_DIGITS).lower()))


def _stem(word: str) -> str:
    # Plural suffix, so «فیلم‌های نولان» and «فیلم نولان» compare equal.
    for suffix in ("های", "ها"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 2:
            return word[: -len(suffix)]
    return word


def content_words(title: str) -> set[str]:
    """Distinctive words of a title. Falls back to every non-numeric word when
    a title is made only of generic ones («بهترین فیلم‌ها»)."""
    words = [_stem(w) for w in normalize(title).split() if not w.isdigit()]
    distinctive = {w for w in words if w not in _GENERIC and len(w) >= 2}
    return distinctive or set(words)


def _kinds(title: str) -> set[str]:
    return {_stem(w) for w in normalize(title).split()} & _KINDS


def similarity(a: str, b: str) -> float:
    """1.0 for the same title, otherwise word overlap in 0..1."""
    if normalize(a) == normalize(b):
        return 1.0
    ka, kb = _kinds(a), _kinds(b)
    if ka and kb and ka.isdisjoint(kb):
        return 0.0
    wa, wb = content_words(a), content_words(b)
    if not wa or not wb:
        return 0.0
    overlap = len(wa & wb)
    if overlap == 0:
        return 0.0
    union = len(wa | wb)
    score = overlap / union
    # One title's words wholly inside the other's («فیلم‌های نولان» vs
    # «بهترین فیلم‌های نولان و اسپیلبرگ») is a near-duplicate too.
    if overlap == min(len(wa), len(wb)) and min(len(wa), len(wb)) >= 2:
        score = max(score, 0.8)
    return score
