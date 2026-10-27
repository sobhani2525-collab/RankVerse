"""
Imports Fajr Film Festival (سیمرغ بلورین) results from Persian Wikipedia's
per-category tables into entity_awards. Wikidata covers Fajr too thinly to
use (see sync/awards.py), so titles and people are matched by their Persian
name instead.

A title is matched by title_fa within a few years of the festival; a person
by name, preferring the candidate credited on the matched title. Rows that
match nothing, or match ambiguously, are reported and skipped -- never guessed.
"""
import asyncio
import json
import re
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from html.parser import HTMLParser

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.entities.models import Entity, EntityAward, RelationshipEdge

API_URL = "https://fa.wikipedia.org/w/api.php"
USER_AGENT = "RankVerse/1.0 (https://github.com/sobhani2525-collab)"
SUFFIX = " جشنواره فیلم فجر"

# award category -> (Wikipedia page, entity the award is recorded on)
CATEGORIES: dict[str, tuple[str, str]] = {
    "Best Film": ("سیمرغ بلورین بهترین فیلم", "film"),
    "Best Director": ("سیمرغ بلورین بهترین کارگردانی", "person"),
    "Best Actor": ("سیمرغ بلورین بهترین بازیگر نقش اول مرد", "person"),
    "Best Actress": ("سیمرغ بلورین بهترین بازیگر نقش اول زن", "person"),
    "Best Supporting Actor": ("سیمرغ بلورین بهترین بازیگر نقش مکمل مرد", "person"),
    "Best Supporting Actress": ("سیمرغ بلورین بهترین بازیگر نقش مکمل زن", "person"),
    "Best Screenplay": ("سیمرغ بلورین بهترین فیلم‌نامه", "person"),
}

_PERSON_HEADERS = ("بازیگر", "کارگردان", "فیلمنامه", "فیلم‌نامه", "نویسنده")
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")


class _Tables(HTMLParser):
    """Top-level <table>s as lists of rows of cell dicts."""

    def __init__(self):
        super().__init__()
        self.tables: list[list[list[dict]]] = []
        self.row = None
        self.cell = None
        self.depth = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "table":
            self.tables.append([])
            self.depth += 1
        elif tag == "tr" and self.depth == 1:
            self.row = []
            self.tables[-1].append(self.row)
        elif tag in ("td", "th") and self.row is not None and self.depth == 1:
            self.cell = {"text": "", "style": a.get("style", ""),
                         "rs": int(a.get("rowspan", 1) or 1), "cs": int(a.get("colspan", 1) or 1)}
            self.row.append(self.cell)
        elif tag == "br" and self.cell is not None:
            self.cell["text"] += " | "

    def handle_endtag(self, tag):
        if tag == "table":
            self.depth -= 1
        elif tag in ("td", "th"):
            self.cell = None

    def handle_data(self, data):
        if self.cell is not None and self.depth == 1:
            self.cell["text"] += data


def _grid(rows):
    """Expands rowspan/colspan so every row has one cell per column."""
    out, pending = [], {}
    for row in rows:
        line, ci, cells = [], 0, list(row)
        while cells or ci in pending:
            if ci in pending:
                cell, left = pending[ci]
                line.append(cell)
                if left > 1:
                    pending[ci] = (cell, left - 1)
                else:
                    del pending[ci]
                ci += 1
                continue
            cell = cells.pop(0)
            for _ in range(cell["cs"]):
                line.append(cell)
                if cell["rs"] > 1:
                    pending[ci] = (cell, cell["rs"] - 1)
                ci += 1
        out.append(line)
    return out


def _fetch_html(title: str) -> str:
    url = API_URL + "?" + urllib.parse.urlencode(
        {"action": "parse", "page": title + SUFFIX, "prop": "text", "format": "json", "formatversion": 2}
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    last: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)["parse"]["text"]
        except (OSError, KeyError) as e:
            last = e
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"could not fetch {title!r}: {last!r}")


def norm(name: str) -> str:
    """Name key: unified ی/ک, no ZWNJ, spaces, footnotes or punctuation."""
    name = re.sub(r"\[[^\]]*\]", "", name).replace("ي", "ی").replace("ك", "ک")
    return re.sub(r"[‌‎‏‪-‮⁦-⁩\s\-:؟?!.,«»\"'()]+", "", name)


def _split_people(text: str) -> list[str]:
    text = re.sub(r"\[[^\]]*\]", "", text)
    return [p.strip() for p in re.split(r"\s*[|،,]\s*|\s+و\s+", text) if p.strip()]


def parse_category(title: str) -> list[dict]:
    """Rows of {year (Gregorian), names, film, won} from one category page."""
    parser = _Tables()
    parser.feed(_fetch_html(title))
    table = None
    for t in parser.tables:
        g = _grid(t)
        if g and any(c["text"].strip() == "سال" for c in g[0]) and (table is None or len(g) > len(table)):
            table = g
    if table is None:
        raise RuntimeError(f"no results table on {title!r}")

    head = [c["text"].strip() for c in table[0]]
    year_i = head.index("سال")
    film_i = next(i for i, h in enumerate(head) if "فیلم" in h and "نامه" not in h and "نویس" not in h)
    person_i = next((i for i, h in enumerate(head) if any(w in h for w in _PERSON_HEADERS)), None)
    has_marks = any("FAEB86" in c["style"].upper() for line in table for c in line)

    rows = []
    for line in table[1:]:
        year = re.search(r"(1[34]\d\d)", line[year_i]["text"].translate(_DIGITS))
        film = re.sub(r"\[[^\]]*\]", "", line[film_i]["text"]).strip()
        if not year or not film or "اهدا نشد" in film or "برنده نداشت" in film or film.startswith("دهه"):
            continue
        won = True if not has_marks else "FAEB86" in line[film_i]["style"].upper() or (
            person_i is not None and "FAEB86" in line[person_i]["style"].upper()
        )
        names = _split_people(line[person_i]["text"]) if person_i is not None else []
        # the festival is held in Bahman (February): Solar year + 622
        rows.append({"year": int(year.group(1)) + 622, "names": names, "film": film.split(" | ")[0].strip(), "won": won})
    return rows


async def import_fajr(db: AsyncSession) -> dict:
    movies: dict[str, list] = defaultdict(list)
    people: dict[str, list] = defaultdict(list)
    for eid, etype, fa, year in (
        await db.execute(
            select(Entity.id, Entity.entity_type, Entity.attributes["title_fa"].astext, Entity.attributes["year"].astext)
            .where(Entity.entity_type.in_(["movie", "person"]), Entity.attributes["title_fa"].astext.isnot(None))
        )
    ).all():
        if etype == "person":
            people[norm(fa)].append(eid)
        else:
            movies[norm(fa)].append((eid, int(year) if year and year.isdigit() else None))

    stats = {"rows": 0, "matched": 0}
    unmatched: list[str] = []
    values: dict[tuple, dict] = {}

    def match_film(name: str, year: int):
        cands = [eid for eid, y in movies.get(norm(name), []) if y is not None and year - 2 <= y <= year]
        if not cands:
            return None
        return cands[0] if len(cands) == 1 else "ambiguous"

    for category, (page, kind) in CATEGORIES.items():
        rows = await asyncio.to_thread(parse_category, page)
        for r in rows:
            stats["rows"] += 1
            film_id = match_film(r["film"], r["year"])
            status = "won" if r["won"] else "nominated"
            if film_id is None or film_id == "ambiguous":
                unmatched.append(f"{category} {r['year']}: film {r['film']!r} ({'not found' if film_id is None else 'ambiguous'})")
                continue
            targets = [(film_id, None)] if kind == "film" else []
            if kind == "person":
                for name in r["names"]:
                    cands = people.get(norm(name), [])
                    if len(cands) > 1:
                        cands = list(
                            (await db.execute(
                                select(RelationshipEdge.to_entity_id).where(
                                    RelationshipEdge.from_entity_id == film_id, RelationshipEdge.to_entity_id.in_(cands)
                                )
                            )).scalars()
                        )
                    if len(cands) == 1:
                        targets.append((cands[0], film_id))
                    else:
                        unmatched.append(f"{category} {r['year']}: person {name!r} ({'not found' if not cands else 'ambiguous'})")
            for eid, for_id in targets:
                values[(eid, category, r["year"], for_id)] = {
                    "entity_id": eid, "award": "fajr", "category": category, "year": r["year"],
                    "status": status, "for_entity_id": for_id,
                }
                stats["matched"] += 1

    rows_all = list(values.values())
    for i in range(0, len(rows_all), 1000):
        stmt = insert(EntityAward).values(rows_all[i:i + 1000])
        await db.execute(stmt.on_conflict_do_update(constraint="uq_entity_awards_result", set_={"status": stmt.excluded.status}))
    await db.commit()
    stats["unmatched"] = unmatched
    return stats
