"""
Imports award results (won / nominated) from Wikidata into entity_awards,
matching Wikidata items to our entities by IMDb id (titles) or TMDb id
(people). Only awards listed in SOURCES are fetched.
"""
import asyncio
import json
import time
import urllib.error
import urllib.parse
import urllib.request

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.entities.models import Entity, EntityAward

SPARQL_URL = "https://query.wikidata.org/sparql"
USER_AGENT = "RankVerse/1.0 (https://github.com/sobhani2525-collab)"

# award key -> (property linking a category to the award, Wikidata item it
# points at, category label prefix; labels without the prefix are skipped)
SOURCES: dict[str, tuple[str, str, str]] = {
    "oscar": ("P1027", "Q212329", "Academy Award for "),
    "golden_globe": ("P361", "Q1011547", "Golden Globe Award for "),
    "bafta": ("P361", "Q732997", "BAFTA Award for "),
    "emmy": ("P361", "Q1044427", "Primetime Emmy Award for "),
}

_CATEGORIES_QUERY = """
SELECT ?cat ?catLabel WHERE {{
  ?cat wdt:{link} wd:{ceremony} .
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
"""

# One category and one status per query: bigger queries time out on Wikidata.
_RESULTS_QUERY = """
SELECT ?imdb ?tmdb ?forImdb ?year WHERE {{
  ?x p:{prop} ?st . ?st ps:{prop} wd:{cat} .
  OPTIONAL {{ ?x wdt:P345 ?imdb . }}
  OPTIONAL {{ ?x wdt:P4985 ?tmdb . }}
  FILTER(BOUND(?imdb) || BOUND(?tmdb))
  ?st pq:P585 ?t . BIND(YEAR(?t) AS ?year)
  OPTIONAL {{ ?st pq:P1686 ?work . ?work wdt:P345 ?forImdb . }}
}}
"""


def _fetch(query: str) -> list[dict]:
    url = SPARQL_URL + "?" + urllib.parse.urlencode({"query": query})
    req = urllib.request.Request(url, headers={"Accept": "application/sparql-results+json", "User-Agent": USER_AGENT})
    last: Exception | None = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.load(resp)["results"]["bindings"]
        except OSError as e:  # URLError, HTTPError (429/5xx), timeouts, resets
            last = e
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"Wikidata SPARQL endpoint kept failing: {last!r}")


def _fetch_all(link: str, ceremony: str, prefix: str) -> list[dict]:
    rows: list[dict] = []
    for c in _fetch(_CATEGORIES_QUERY.format(link=link, ceremony=ceremony)):
        qid = c["cat"]["value"].rsplit("/", 1)[-1]
        label = c["catLabel"]["value"]
        if not label.startswith(prefix):
            continue
        category = label.removeprefix(prefix)
        for prop, won in (("P166", "true"), ("P1411", "false")):
            time.sleep(2)
            try:
                found = _fetch(_RESULTS_QUERY.format(prop=prop, cat=qid))
            except RuntimeError as e:
                print(f"skipped {category} ({prop}): {e}", flush=True)
                continue
            for b in found:
                b["catLabel"] = {"value": category}
                b["won"] = {"value": won}
                rows.append(b)
        print(f"{category}: {len(rows)} rows so far", flush=True)
    return rows


async def import_awards(db: AsyncSession, award: str) -> dict[str, int]:
    link, ceremony, prefix = SOURCES[award]
    rows = await asyncio.to_thread(_fetch_all, link, ceremony, prefix)

    by_imdb = {
        imdb: eid
        for eid, imdb in (
            await db.execute(
                select(Entity.id, Entity.attributes["imdb_id"].astext).where(
                    Entity.entity_type.in_(["movie", "tv_series"]),
                    Entity.attributes["imdb_id"].astext.isnot(None),
                )
            )
        ).all()
    }
    # people carry only a TMDb id (Wikidata P4985), no IMDb id
    by_tmdb = {
        tmdb: eid
        for eid, tmdb in (
            await db.execute(
                select(Entity.id, Entity.external_id).where(
                    Entity.entity_type == "person", Entity.external_source == "tmdb_person"
                )
            )
        ).all()
    }

    values: dict[tuple, dict] = {}
    for b in rows:
        eid = by_imdb.get(b["imdb"]["value"]) if "imdb" in b else None
        if not eid and "tmdb" in b:
            eid = by_tmdb.get(b["tmdb"]["value"])
        if not eid:
            continue
        for_id = by_imdb.get(b["forImdb"]["value"]) if "forImdb" in b else None
        category = b["catLabel"]["value"]
        year = int(b["year"]["value"])
        won = b["won"]["value"] in ("true", "1")
        key = (eid, category, year, for_id)
        # a result can be listed as both nominated and won; won takes precedence
        if key not in values or won:
            values[key] = {
                "entity_id": eid, "award": award, "category": category, "year": year,
                "status": "won" if won else "nominated", "for_entity_id": for_id,
            }

    for i in range(0, len(values), 1000):
        chunk = list(values.values())[i:i + 1000]
        stmt = insert(EntityAward).values(chunk)
        await db.execute(stmt.on_conflict_do_update(constraint="uq_entity_awards_result", set_={"status": stmt.excluded.status}))
    await db.commit()
    return {"fetched": len(rows), "matched": len(values)}
