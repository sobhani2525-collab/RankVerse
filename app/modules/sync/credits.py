"""
TMDb's Persian synopses are written by volunteers, some of whom sign them
("مترجم: shabnam_05", "ترجمه از رضا بهادری"). The signature is not part of
the synopsis, so it is dropped before the text is stored or shown.
"""
import re

_NAME = r"[^\s،؛]+(?:[ \t][^\s،؛]+){0,2}"
# "مترجم : name" / "ترجمه از : name" / "(ترجمه از فیلیمو)" closing the text.
_LABELLED = (
    r"(?:مترجم|مترجمین|ترجمه\s+(?:از|توسط)(?:\s+منبع)?)\s*[:：]\s*[(\[]?\s*(?:" + _NAME + r")?\s*[)\]]?"
)
# "ترجمه از name" without a colon: only after a line break / double space / "(",
# so a sentence ending "...ترجمه از ..." is left alone.
_UNLABELLED = r"(?:(?<=\n)|(?<=\r)|(?<=\s\s)|(?<=\())ترجمه\s+(?:از|توسط)\s+" + _NAME
# "yavar.love :مترجم" (label after the name).
_REVERSED = _NAME + r"\s*:\s*مترجم"

_CREDIT = re.compile(
    r"(?:^|[\s\-–—•*(\[]*)(?:" + _LABELLED + "|" + _UNLABELLED + "|" + _REVERSED + r")[)\]]?\s*$"
)


def strip_translator_credit(overview: str | None) -> str | None:
    if not overview:
        return overview
    cleaned = _CREDIT.sub("", overview).rstrip()
    return cleaned or overview
