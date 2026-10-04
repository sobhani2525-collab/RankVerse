"""
What a list's own title says about what belongs in it: «برترین فیلم‌های تیم
برتون» -> a person, «بهترین موزیکال‌های دهه ۱۹۹۰» -> a genre and a decade.

Pure (no DB access): `parse_title_hints` only cuts the title into a decade, genre
names and candidate name phrases; ListService resolves the phrases to people
(a director or an actor) and the genre names to genre entities, then asks the
repository for titles matching all of them (see suggest flow in
ListService.get_candidates).
"""
import re
from dataclasses import dataclass, field

from app.modules.lists.similar import _GENERIC, normalize

# Persian words in list titles -> the (lower-cased) English genre entity title.
GENRE_WORDS_FA: dict[str, str] = {
    "اکشن": "action", "ماجراجویی": "adventure", "انیمیشن": "animation", "انیمه": "animation",
    "کمدی": "comedy", "طنز": "comedy", "جنایی": "crime", "مستند": "documentary", "درام": "drama",
    "خانوادگی": "family", "فانتزی": "fantasy", "تاریخی": "history", "ترسناک": "horror", "وحشت": "horror",
    "موسیقی": "music", "موزیکال": "music", "معمایی": "mystery", "رازآلود": "mystery",
    "عاشقانه": "romance", "رمانتیک": "romance", "علمی تخیلی": "science fiction", "علمی‌تخیلی": "science fiction",
    "هیجانی": "thriller", "تریلر": "thriller", "جنگی": "war", "وسترن": "western",
}
GENRE_WORDS_EN: dict[str, str] = {
    "action": "action", "adventure": "adventure", "animation": "animation", "comedy": "comedy",
    "crime": "crime", "documentary": "documentary", "drama": "drama", "family": "family",
    "fantasy": "fantasy", "history": "history", "horror": "horror", "music": "music", "musical": "music",
    "mystery": "mystery", "romance": "romance", "thriller": "thriller", "war": "war", "western": "western",
}

_DECADE_WORDS = {"شصت": 1960, "هفتاد": 1970, "هشتاد": 1980, "نود": 1990}
_WORD_STEM = re.compile(r"(?:های|ها)$")
_DECADE_4 = re.compile(r"(?:دهه\s*)?\b(1[89]\d0|20[0-2]0)\s*(?:s|ها)?\b")
_DECADE_2 = re.compile(r"دهه\s*(\d{2})\b")
_DECADE_S = re.compile(r"\b(\d{2})s\b")
_MAX_PHRASE_WORDS = 3


@dataclass
class TitleHints:
    decade: int | None = None  # first year of the decade, e.g. 1990
    genres: set[str] = field(default_factory=set)  # lower-cased English genre titles
    phrases: list[str] = field(default_factory=list)  # candidate person names, longest first

    def __bool__(self) -> bool:
        return bool(self.decade or self.genres or self.phrases)


def _two_digit_decade(two: int) -> int | None:
    if two % 10:
        return None
    return 1900 + two if two >= 30 else 2000 + two


def _find_decade(text: str) -> tuple[int | None, str]:
    """(decade start, text with the decade words removed)."""
    for pattern, convert in (
        (_DECADE_4, lambda m: int(m.group(1))),
        (_DECADE_2, lambda m: _two_digit_decade(int(m.group(1)))),
        (_DECADE_S, lambda m: _two_digit_decade(int(m.group(1)))),
    ):
        match = pattern.search(text)
        if match:
            decade = convert(match)
            if decade:
                return decade, text[: match.start()] + " " + text[match.end():]
    match = re.search(r"دهه\s+(\S+)", text)
    if match and match.group(1) in _DECADE_WORDS:
        return _DECADE_WORDS[match.group(1)], text[: match.start()] + " " + text[match.end():]
    return None, text


def parse_title_hints(title: str) -> TitleHints:
    text = normalize(title)
    decade, text = _find_decade(text)

    genres: set[str] = set()
    for word, genre in GENRE_WORDS_FA.items():
        key = normalize(word)
        if key in text:
            genres.add(genre)
            text = text.replace(key, " ")
    words: list[str] = []
    for word in text.split():
        stem = _WORD_STEM.sub("", word) if len(word) > 4 else word
        if stem in GENRE_WORDS_EN:
            genres.add(GENRE_WORDS_EN[stem])
        else:
            words.append(word)

    # Name phrases: runs of consecutive non-generic words, longest windows first.
    phrases: list[str] = []
    runs: list[list[str]] = [[]]
    for word in words:
        if word in _GENERIC or word.isdigit() or len(word) < 2:
            runs.append([])
        else:
            runs[-1].append(word)
    for run in runs:
        for size in range(min(_MAX_PHRASE_WORDS, len(run)), 0, -1):
            for start in range(len(run) - size + 1):
                phrase = " ".join(run[start:start + size])
                if size > 1 or len(phrase) >= 3:
                    phrases.append(phrase)
    return TitleHints(decade=decade, genres=genres, phrases=phrases[:14])
