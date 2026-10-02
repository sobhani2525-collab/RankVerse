"""
Smart add-item suggestions for a list: how a candidate connects to what is
already in the list, and how well it fits.

Pure (no DB access) like graph.py: ListService loads the graph slice of the
list's items and of each candidate (GraphItem, incl. a person's filmography)
and this module scores them. One `Reason` per candidate drives both the line
shown under it ("متصل به #۴ از طریق ...") and the ordering.

Signals, strongest first:
  * people  -- a shared director/creator/top-billed actor between two titles,
               a shared work between two people, or a person credited on the
               other item (either way round). 3 points per connected item.
  * genre   -- the candidate's genres (a person's: the genres most of their
               work shares) against the genres the list is made of.
  * country -- same country as most of the list (an Iranian list should not
               fill up with Hollywood), a small bonus.
  * quality -- the title's external rating, a small tie-breaker.
"""
from collections import Counter
from dataclasses import dataclass, field

from app.modules.lists.graph import GraphItem, shared_person
from app.modules.lists.schemas import EntityRef

PEOPLE_POINTS = 3.0
GENRE_POINTS = 1.0
COUNTRY_POINTS = 0.8
QUALITY_POINTS = 0.5


@dataclass
class ListProfile:
    """What the list as a whole is made of -- computed once per request."""
    genre_weights: dict = field(default_factory=dict)  # genre id -> share of items (0..1]
    countries: set[str] = field(default_factory=set)
    size: int = 0


@dataclass
class Reason:
    strength: int  # 0 none, 1 genre, 2 people (one item), 3 people (several items)
    kind: str  # "people" | "genre" | "none"
    text: str
    score: float


def _item_genres(node: GraphItem) -> list[EntityRef]:
    return node.career_genres if node.entity_type == "person" else node.genres


def build_profile(nodes: list[GraphItem], countries: list[str | None]) -> ListProfile:
    counts: Counter = Counter()
    for node in nodes:
        for genre in {g.id for g in _item_genres(node)}:
            counts[genre] += 1
    size = len(nodes)
    weights = {gid: n / size for gid, n in counts.items()} if size else {}
    # Countries at least a third of the titles share (a person has none).
    country_counts = Counter(c for c in countries if c)
    titled = sum(country_counts.values())
    common = {c for c, n in country_counts.items() if titled and n / titled >= 1 / 3}
    return ListProfile(genre_weights=weights, countries=common, size=size)


def _at(ranks: list[int], shown: int = 3) -> str:
    """"#۴ و #۵"; past `shown` ranks, "#۱ و #۲ و #۳ و ۱۱ مورد دیگر"."""
    parts = [f"#{_fa(r)}" for r in ranks[:shown]]
    if len(ranks) > shown:
        parts.append(f"{_fa(len(ranks) - shown)} مورد دیگر")
    return " و ".join(parts)


def _fa(n: int) -> str:
    return str(n).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def _display(ref: EntityRef) -> str:
    return ref.title_fa or ref.title


def _link(candidate: GraphItem, node: GraphItem, cast_depth: int) -> tuple[str, str] | None:
    """How `candidate` is tied to one list item through people: (kind, via)
    where kind is "work" (via = shared work title), "role" (candidate is a
    person credited on the item), "cast" (the item is a person credited on
    the candidate) or "person" (two titles sharing via = a person)."""
    c_person, n_person = candidate.entity_type == "person", node.entity_type == "person"
    if c_person and n_person:
        shared = [w for wid, (w, _) in candidate.credits.items() if wid in node.credits]
        return ("work", _display(min(shared, key=lambda w: w.title))) if shared else None
    if c_person:
        return ("role", "") if node.entity_id in candidate.credits else None
    if n_person:
        return ("cast", _display(node.ref)) if node.ref and candidate.entity_id in node.credits else None
    person = shared_person(candidate, node, cast_depth)
    return ("person", _display(person)) if person else None


def explain_candidate(
    candidate: GraphItem,
    list_nodes: list[GraphItem],
    profile: ListProfile,
    cast_depth: int,
    country: str | None = None,
    rating: float | None = None,
) -> Reason:
    links: list[tuple[int, str, str]] = []  # (rank, kind, via)
    for index, node in enumerate(list_nodes):
        link = _link(candidate, node, cast_depth)
        if link:
            links.append((index + 1, link[0], link[1]))

    genre_share = sum(profile.genre_weights.get(g.id, 0) for g in _item_genres(candidate))
    genre_share = min(1.0, genre_share)
    score = (
        PEOPLE_POINTS * min(len(links), 4)
        + GENRE_POINTS * genre_share
        + (COUNTRY_POINTS if country and country in profile.countries else 0)
        + QUALITY_POINTS * ((rating or 0) / 10)
    )

    if links:
        _, kind, via = links[0]
        ranks = [r for r, k, _ in links if k == kind]
        if kind == "work":
            text = f"هم‌پروژه با {_at(ranks)} در {via}"
        elif kind == "role":
            text = f"در {_at(ranks)} نقش دارد"
        elif kind == "cast":
            text = f"{via} ({_at(ranks)}) در این اثر نقش دارد"
        else:
            text = f"متصل به {_at(ranks)} از طریق {via}"
        return Reason(strength=3 if len(links) > 1 else 2, kind="people", text=text, score=score)

    if genre_share > 0:
        matched = sum(1 for node in list_nodes if {g.id for g in _item_genres(node)} & {g.id for g in _item_genres(candidate)})
        return Reason(
            strength=1, kind="genre", score=score,
            text=f"ژانر مشترک با {_fa(matched)} آیتم این فهرست",
        )
    return Reason(strength=0, kind="none", text="بدون اتصال مستقیم به این فهرست", score=score)
