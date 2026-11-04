"""
TMDb's Persian synopses are written by volunteers, some of whom sign them
("مترجم: shabnam_05"). The signature is not part of the synopsis, so it is
dropped before the text is stored or shown.
"""
import re

# A translator credit on its own line or closing the text, with whatever
# separator (dash, bullet, brackets) precedes it. Nothing after the name.
_TRANSLATOR_CREDIT = re.compile(
    r"(?:^|\n|[\s\-–—•*(\[]+)(?:مترجم|مترجمین|ترجمه\s+(?:از|توسط)|ترجمه\s+و\s+تلخیص)\s*[:：]\s*[^\s.،؛]+(?:[ \t][^\s.،؛]+){0,2}[)\]]?\s*$",
    re.IGNORECASE,
)


def strip_translator_credit(overview: str | None) -> str | None:
    if not overview:
        return overview
    cleaned = _TRANSLATOR_CREDIT.sub("", overview).rstrip()
    return cleaned or overview
