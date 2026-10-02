"""
List detail "constellation": explains a ranked list as a path through the
knowledge graph -- why each item connects to the next one (edges), which
items also reach back to an earlier, non-adjacent item (backlinks), what
the list as a whole is made of (dna), and which two items make the most
natural head-to-head battle.

Everything here is pure (no DB access): ListService loads each item's
directed_by / creator / acted_in / has_genre edges in one query, builds a
GraphItem per list item, and hands them over in display order. Positions
in the output are 1-based display ranks (#1 is the first item shown),
not UserListItem.position.
"""
import uuid
from dataclasses import dataclass, field

from app.modules.lists.schemas import (
    DecadeCount, DnaCount, EntityRef, ListBacklink, ListBattlePair, ListDna, ListEdge,
)

# Persian label prefix per relation_type, shared with the smart-suggestion
# "why" chip (see ListService.get_smart_suggestions) -- e.g. "کارگردان
# مشترک: X". Anything not listed here still works there, just with a
# generic fallback label.
RELATION_LABELS_FA: dict[str, str] = {
    "directed_by": "کارگردان مشترک",
    "creator": "سازنده مشترک",
    "has_genre": "ژانر مشترک",
    "acted_in": "بازیگر مشترک",
    "performed_by": "هنرمند مشترک",
    "part_of": "بخشی از همان مجموعه",
    "aired_on": "پخش‌کننده مشترک",
    "similar_to": "شبیه به",
}
RELATION_LABEL_FALLBACK_FA = "ویژگی مشترک"

# Entity types a battle can be fought in (see /battles categories) that
# also carry director/cast edges -- the only kind of pair we suggest.
BATTLE_TYPES = ("movie", "tv_series")


@dataclass
class GraphItem:
    """One list item's slice of the graph. Each list is already in display
    order: directors/creators as they should be shown, cast by billing
    order (the whole synced cast -- cast_depth is applied here)."""
    entity_type: str
    year: int | None = None
    directors: list[EntityRef] = field(default_factory=list)
    creators: list[EntityRef] = field(default_factory=list)
    cast: list[EntityRef] = field(default_factory=list)
    genres: list[EntityRef] = field(default_factory=list)
    # Only for a `person` item: its own node, the works it is credited on
    # (work id -> (work, relation types)) and the genres most of those works
    # share, most common first. A person has no directors/cast/genres of its
    # own, so its filmography is what connects it to other items.
    entity_id: uuid.UUID | None = None
    ref: EntityRef | None = None
    credits: dict = field(default_factory=dict)
    career_genres: list[EntityRef] = field(default_factory=list)

    def makers(self) -> list[EntityRef]:
        """Creators first (a series' showrunner is the closer analogue of a
        film's director than its per-episode directors), then directors,
        each person once."""
        seen: set = set()
        out: list[EntityRef] = []
        for person in [*self.creators, *self.directors]:
            if person.id not in seen:
                seen.add(person.id)
                out.append(person)
        return out

    def top_cast(self, depth: int) -> list[EntityRef]:
        return self.cast[:depth]

    def people(self, cast_depth: int) -> list[EntityRef]:
        seen: set = set()
        out: list[EntityRef] = []
        for person in [*self.makers(), *self.top_cast(cast_depth)]:
            if person.id not in seen:
                seen.add(person.id)
                out.append(person)
        return out


def _maker_label(a: GraphItem, b: GraphItem, person: EntityRef) -> str:
    directed_both = any(p.id == person.id for p in a.directors) and any(
        p.id == person.id for p in b.directors
    )
    return RELATION_LABELS_FA["directed_by" if directed_both else "creator"]


def shared_maker(a: GraphItem, b: GraphItem) -> tuple[EntityRef, str] | None:
    """First of a's directors/creators that b shares, with its label."""
    b_ids = {p.id for p in b.makers()}
    for person in a.makers():
        if person.id in b_ids:
            return person, _maker_label(a, b, person)
    return None


def shared_actor(a: GraphItem, b: GraphItem, cast_depth: int) -> EntityRef | None:
    """The shared top-billed actor billed highest across both titles (lowest
    worse-of-the-two billing index, then lowest combined index)."""
    b_index = {p.id: i for i, p in enumerate(b.top_cast(cast_depth))}
    best: tuple[tuple[int, int], EntityRef] | None = None
    for i, person in enumerate(a.top_cast(cast_depth)):
        j = b_index.get(person.id)
        if j is None:
            continue
        key = (max(i, j), i + j)
        if best is None or key < best[0]:
            best = (key, person)
    return best[1] if best else None


def shared_person(a: GraphItem, b: GraphItem, cast_depth: int) -> EntityRef | None:
    maker = shared_maker(a, b)
    if maker:
        return maker[0]
    return shared_actor(a, b, cast_depth)


def _genre_frequency(items: list[GraphItem]) -> dict:
    counts: dict = {}
    for item in items:
        for genre in {g.id: g for g in item.genres}.values():
            counts[genre.id] = counts.get(genre.id, 0) + 1
    return counts


CREDIT_RELATIONS = ("directed_by", "creator", "acted_in")
# Shown when a person is credited on the other item itself; first match wins.
CREDIT_ROLE_LABELS_FA = {
    "directed_by": "کارگردان همین اثر",
    "creator": "سازنده همین اثر",
    "acted_in": "بازیگر همین اثر",
}
SHARED_WORK_LABEL_FA = "هم‌پروژه در"
SHARED_CAREER_GENRE_LABEL_FA = "ژانر غالب مشترک"
CAREER_GENRE_DEPTH = 3
MAX_SHARED_WORKS = 2


def person_graph_data(
    credit_rows: list[tuple[uuid.UUID, str, EntityRef]],
    genre_rows: list[tuple[uuid.UUID, EntityRef]],
) -> dict[uuid.UUID, tuple[dict, list[EntityRef]]]:
    """person id -> (credits, career_genres) from the persons' incoming
    directed_by/creator/acted_in edges (person, relation, work) and the
    works' has_genre edges (work id, genre)."""
    work_genres: dict[uuid.UUID, list[EntityRef]] = {}
    for work_id, genre in genre_rows:
        work_genres.setdefault(work_id, []).append(genre)

    credits_by_person: dict[uuid.UUID, dict] = {}
    for person_id, relation, work in credit_rows:
        entry = credits_by_person.setdefault(person_id, {}).setdefault(work.id, (work, set()))
        entry[1].add(relation)

    out: dict[uuid.UUID, tuple[dict, list[EntityRef]]] = {}
    for person_id, credits in credits_by_person.items():
        counts: dict = {}
        for work_id in credits:
            for genre in {g.id: g for g in work_genres.get(work_id, [])}.values():
                entry = counts.setdefault(genre.id, [genre, 0])
                entry[1] += 1
        ranked = sorted(counts.values(), key=lambda e: (-e[1], e[0].title))
        out[person_id] = (credits, [g for g, _ in ranked[:CAREER_GENRE_DEPTH]])
    return out


def _shared_genre_edge(
    from_rank: int, label: str, a: list[EntityRef], b: list[EntityRef], max_genres: int
) -> ListEdge | None:
    b_ids = {g.id for g in b}
    shared = [g for g in {g.id: g for g in a}.values() if g.id in b_ids][:max_genres]
    if not shared:
        return None
    return ListEdge(
        from_rank=from_rank, kind="genre", label_fa=label,
        value=" · ".join(g.title for g in shared), targets=shared,
    )


def _person_edge(
    a: GraphItem, b: GraphItem, from_rank: int, max_genres: int
) -> ListEdge | None:
    """Edge when at least one side is a person: a shared work, the role the
    person played on the other item, else genres their careers share."""
    if a.entity_type == "person" and b.entity_type == "person":
        shared = [a.credits[w][0] for w in a.credits if w in b.credits]
        if shared:
            shared.sort(key=lambda w: w.title)
            shared = shared[:MAX_SHARED_WORKS]
            return ListEdge(
                from_rank=from_rank, kind="people", label_fa=SHARED_WORK_LABEL_FA,
                value=" · ".join(w.title for w in shared), targets=shared,
            )
        return _shared_genre_edge(
            from_rank, SHARED_CAREER_GENRE_LABEL_FA, a.career_genres, b.career_genres, max_genres
        )

    person, other = (a, b) if a.entity_type == "person" else (b, a)
    credit = person.credits.get(other.entity_id) if other.entity_id else None
    if credit and person.ref:
        for relation in CREDIT_RELATIONS:
            if relation in credit[1]:
                return ListEdge(
                    from_rank=from_rank, kind="people", label_fa=CREDIT_ROLE_LABELS_FA[relation],
                    value=person.ref.title, targets=[person.ref],
                )
    return _shared_genre_edge(
        from_rank, RELATION_LABELS_FA["has_genre"], person.career_genres, other.genres, max_genres
    )


def compute_edge(
    a: GraphItem,
    b: GraphItem,
    from_rank: int,
    priority: list[str],
    cast_depth: int,
    max_genres: int,
    genre_frequency: dict | None = None,
) -> ListEdge:
    if "person" in (a.entity_type, b.entity_type):
        edge = _person_edge(a, b, from_rank, max_genres)
        return edge or ListEdge(from_rank=from_rank, kind="none")
    for kind in priority:
        if kind == "director":
            maker = shared_maker(a, b)
            if maker:
                person, label = maker
                return ListEdge(
                    from_rank=from_rank, kind="people", label_fa=label,
                    value=person.title, targets=[person],
                )
        elif kind == "actor":
            person = shared_actor(a, b, cast_depth)
            if person:
                return ListEdge(
                    from_rank=from_rank, kind="people", label_fa=RELATION_LABELS_FA["acted_in"],
                    value=person.title, targets=[person],
                )
        elif kind == "genre":
            b_ids = {g.id for g in b.genres}
            shared = [g for g in {g.id: g for g in a.genres}.values() if g.id in b_ids]
            if shared:
                # Most common genres across the whole list first -- those
                # are the ones the list is "about" -- then alphabetical.
                freq = genre_frequency or {}
                shared.sort(key=lambda g: (-freq.get(g.id, 0), g.title))
                shared = shared[:max_genres]
                return ListEdge(
                    from_rank=from_rank, kind="genre", label_fa=RELATION_LABELS_FA["has_genre"],
                    value=" · ".join(g.title for g in shared), targets=shared,
                )
    return ListEdge(from_rank=from_rank, kind="none")


def compute_edges(
    items: list[GraphItem], priority: list[str], cast_depth: int, max_genres: int
) -> list[ListEdge]:
    """edges[i] connects rank i+1 to rank i+2; len == max(0, len(items) - 1)."""
    freq = _genre_frequency(items)
    return [
        compute_edge(items[i], items[i + 1], i + 1, priority, cast_depth, max_genres, freq)
        for i in range(len(items) - 1)
    ]


def compute_backlinks(items: list[GraphItem], cast_depth: int) -> list[ListBacklink]:
    """For each item, the earliest earlier item -- skipping the one right
    before it, which the edge already covers -- that shares a person."""
    backlinks: list[ListBacklink] = []
    for i, item in enumerate(items):
        for j in range(0, i - 1):
            person = shared_person(item, items[j], cast_depth)
            if person:
                backlinks.append(ListBacklink(
                    rank=i + 1, target_position=j + 1,
                    person_name=person.title, person_name_fa=person.title_fa, person_slug=person.slug,
                ))
                break
    return backlinks


def compute_dna(
    items: list[GraphItem], cast_depth: int, hub_limit: int, hub_min_items: int
) -> ListDna:
    type_counts: dict[str, int] = {}
    genres: dict = {}
    people: dict = {}
    decades: dict[int, int] = {}

    for index, item in enumerate(items):
        type_counts[item.entity_type] = type_counts.get(item.entity_type, 0) + 1
        for genre in {g.id: g for g in item.genres}.values():
            entry = genres.setdefault(genre.id, [genre, 0])
            entry[1] += 1
        for person in item.people(cast_depth):
            entry = people.setdefault(person.id, [person, 0, index])
            entry[1] += 1
        if item.year:
            decade = item.year // 10 * 10
            decades[decade] = decades.get(decade, 0) + 1

    genre_counts = sorted(genres.values(), key=lambda e: (-e[1], e[0].title))
    hubs = sorted(
        (e for e in people.values() if e[1] >= hub_min_items),
        key=lambda e: (-e[1], e[2], e[0].title),
    )[:hub_limit]

    return ListDna(
        type_counts=type_counts,
        genres=[DnaCount(entity=g, count=c) for g, c in genre_counts],
        hubs=[DnaCount(entity=p, count=c) for p, c, _ in hubs],
        decades=[DecadeCount(decade=d, count=c) for d, c in sorted(decades.items())],
    )


def pick_battle_pair(items: list[GraphItem], cast_depth: int) -> ListBattlePair | None:
    """The highest-ranked same-type pair sharing a director/creator, else
    one sharing a top-billed actor. None when no such pair exists -- an
    unrelated pair makes a meaningless battle, so we suggest nothing."""
    eligible = [(i, item) for i, item in enumerate(items) if item.entity_type in BATTLE_TYPES]

    per_type: dict[str, int] = {}
    for _, item in eligible:
        per_type[item.entity_type] = per_type.get(item.entity_type, 0) + 1
    pair_count = sum(n * (n - 1) // 2 for n in per_type.values())

    def pairs():
        for x in range(len(eligible)):
            for y in range(x + 1, len(eligible)):
                (i, a), (j, b) = eligible[x], eligible[y]
                if a.entity_type == b.entity_type:
                    yield i, a, j, b

    for i, a, j, b in pairs():
        maker = shared_maker(a, b)
        if maker:
            person, label = maker
            return ListBattlePair(
                left_rank=i + 1, right_rank=j + 1, category=a.entity_type, kind="director",
                label_fa=label, person=person, pair_count=pair_count,
            )
    for i, a, j, b in pairs():
        person = shared_actor(a, b, cast_depth)
        if person:
            return ListBattlePair(
                left_rank=i + 1, right_rank=j + 1, category=a.entity_type, kind="actor",
                label_fa=RELATION_LABELS_FA["acted_in"], person=person, pair_count=pair_count,
            )
    return None
