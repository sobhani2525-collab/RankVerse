"""
Unit tests for the list-detail constellation (app/modules/lists/graph.py).
Pure functions -- no database needed.
Run with: pytest tests/test_list_graph.py
"""
import uuid

from app.modules.lists.graph import (
    GraphItem, compute_backlinks, compute_dna, compute_edges, pick_battle_pair,
)
from app.modules.lists.schemas import EntityRef

PRIORITY = ["director", "actor", "genre"]
CAST_DEPTH = 3
MAX_GENRES = 2


def person(name: str) -> EntityRef:
    return EntityRef(id=uuid.uuid5(uuid.NAMESPACE_DNS, name), slug=name.lower().replace(" ", "-"),
                     title=name, entity_type="person")


def genre(name: str) -> EntityRef:
    return EntityRef(id=uuid.uuid5(uuid.NAMESPACE_URL, name), slug=name.lower(),
                     title=name, entity_type="genre")


NOLAN, VILLENEUVE, SCORSESE = person("Christopher Nolan"), person("Denis Villeneuve"), person("Martin Scorsese")
DICAPRIO, PEARCE, ADAMS, GYLLENHAAL = (
    person("Leonardo DiCaprio"), person("Guy Pearce"), person("Amy Adams"), person("Jake Gyllenhaal")
)
MYSTERY, THRILLER, SCIFI, DRAMA = genre("Mystery"), genre("Thriller"), genre("Science Fiction"), genre("Drama")


def movie(directors=(), cast=(), genres=(), year=None, entity_type="movie", creators=()) -> GraphItem:
    return GraphItem(
        entity_type=entity_type, year=year, directors=list(directors), creators=list(creators),
        cast=list(cast), genres=list(genres),
    )


def edges(items):
    return compute_edges(items, PRIORITY, CAST_DEPTH, MAX_GENRES)


# --- edges ---

def test_shared_director_edge():
    inception = movie([NOLAN], [DICAPRIO], [SCIFI])
    memento = movie([NOLAN], [PEARCE], [MYSTERY])
    [edge] = edges([inception, memento])
    assert edge.from_rank == 1
    assert edge.kind == "people"
    assert edge.label_fa == "کارگردان مشترک"
    assert edge.value == "Christopher Nolan"
    assert [t.slug for t in edge.targets] == ["christopher-nolan"]


def test_director_outranks_actor_and_genre():
    a = movie([NOLAN], [DICAPRIO], [SCIFI])
    b = movie([NOLAN], [DICAPRIO], [SCIFI])
    [edge] = edges([a, b])
    assert edge.label_fa == "کارگردان مشترک"


def test_shared_actor_edge():
    inception = movie([NOLAN], [DICAPRIO, PEARCE], [SCIFI])
    shutter = movie([SCORSESE], [DICAPRIO], [MYSTERY])
    [edge] = edges([inception, shutter])
    assert edge.kind == "people"
    assert edge.label_fa == "بازیگر مشترک"
    assert edge.value == "Leonardo DiCaprio"


def test_actor_beyond_cast_depth_does_not_count():
    fillers = [person(f"Extra {i}") for i in range(CAST_DEPTH)]
    a = movie([NOLAN], [*fillers, DICAPRIO])
    b = movie([SCORSESE], [DICAPRIO])
    [edge] = edges([a, b])
    assert edge.kind == "none"


def test_shared_genre_edge_joins_up_to_two_most_common():
    a = movie([NOLAN], [PEARCE], [MYSTERY, THRILLER, DRAMA])
    b = movie([SCORSESE], [DICAPRIO], [MYSTERY, THRILLER, DRAMA])
    c = movie([VILLENEUVE], [ADAMS], [THRILLER, MYSTERY])
    first, _ = edges([a, b, c])
    assert first.kind == "genre"
    assert first.label_fa == "ژانر مشترک"
    # Mystery and Thriller appear in all three items, Drama in two.
    assert first.value == "Mystery · Thriller"
    assert [t.slug for t in first.targets] == ["mystery", "thriller"]


def test_no_connection_edge():
    [edge] = edges([movie([NOLAN], [PEARCE], [SCIFI]), movie([SCORSESE], [DICAPRIO], [DRAMA])])
    assert edge.kind == "none"
    assert edge.label_fa is None and edge.value is None and edge.targets == []


def test_priority_is_configurable():
    a = movie([NOLAN], [DICAPRIO], [SCIFI])
    b = movie([NOLAN], [DICAPRIO], [SCIFI])
    [edge] = compute_edges([a, b], ["genre", "director"], CAST_DEPTH, MAX_GENRES)
    assert edge.kind == "genre"


def test_series_creator_edge_uses_creator_label():
    dark = movie(creators=[person("Baran bo Odar")], entity_type="tv_series")
    other = movie(creators=[person("Baran bo Odar")], entity_type="tv_series")
    [edge] = edges([dark, other])
    assert edge.kind == "people"
    assert edge.label_fa == "سازنده مشترک"


def test_empty_list():
    assert edges([]) == []
    assert compute_backlinks([], CAST_DEPTH) == []
    assert pick_battle_pair([], CAST_DEPTH) is None
    dna = compute_dna([], CAST_DEPTH, 3, 2)
    assert dna.type_counts == {} and dna.genres == [] and dna.hubs == [] and dna.decades == []


def test_single_item_list():
    only = movie([NOLAN], [DICAPRIO], [SCIFI], year=2010)
    assert edges([only]) == []
    assert compute_backlinks([only], CAST_DEPTH) == []
    assert pick_battle_pair([only], CAST_DEPTH) is None
    dna = compute_dna([only], CAST_DEPTH, 3, 2)
    assert dna.type_counts == {"movie": 1}
    assert dna.hubs == []  # nobody appears in two items


# --- backlinks ---

def test_backlink_to_earliest_non_adjacent_item():
    inception = movie([NOLAN], [DICAPRIO], [SCIFI])
    memento = movie([NOLAN], [PEARCE], [MYSTERY])
    arrival = movie([VILLENEUVE], [ADAMS], [SCIFI])
    shutter = movie([SCORSESE], [DICAPRIO], [MYSTERY])
    backlinks = compute_backlinks([inception, memento, arrival, shutter], CAST_DEPTH)
    assert len(backlinks) == 1
    [link] = backlinks
    assert (link.rank, link.target_position) == (4, 1)
    assert link.person_name == "Leonardo DiCaprio"
    assert link.person_slug == "leonardo-dicaprio"


def test_adjacent_item_is_not_a_backlink():
    inception = movie([NOLAN], [DICAPRIO])
    shutter = movie([SCORSESE], [DICAPRIO])
    assert compute_backlinks([inception, shutter], CAST_DEPTH) == []


# --- dna ---

def test_dna_counts():
    items = [
        movie([NOLAN], [DICAPRIO], [SCIFI], year=2010),
        movie([NOLAN], [PEARCE], [MYSTERY, THRILLER], year=2000),
        movie([SCORSESE], [DICAPRIO], [MYSTERY, THRILLER], year=2010),
        movie([VILLENEUVE], [ADAMS], [SCIFI, DRAMA], year=2016),
        movie([VILLENEUVE], [GYLLENHAAL], [MYSTERY, THRILLER], year=2013),
        movie(creators=[person("Baran bo Odar")], genres=[SCIFI, MYSTERY], year=2017, entity_type="tv_series"),
    ]
    dna = compute_dna(items, CAST_DEPTH, hub_limit=3, hub_min_items=2)
    assert dna.type_counts == {"movie": 5, "tv_series": 1}
    assert [(g.entity.title, g.count) for g in dna.genres] == [
        ("Mystery", 4), ("Science Fiction", 3), ("Thriller", 3), ("Drama", 1),
    ]
    assert [(h.entity.title, h.count) for h in dna.hubs] == [
        ("Christopher Nolan", 2), ("Leonardo DiCaprio", 2), ("Denis Villeneuve", 2),
    ]
    assert [(d.decade, d.count) for d in dna.decades] == [(2000, 1), (2010, 5)]


# --- battle pair ---

def test_battle_pair_prefers_shared_director():
    items = [
        movie([NOLAN], [DICAPRIO]),
        movie([SCORSESE], [DICAPRIO]),  # shares an actor with #1
        movie([NOLAN], [PEARCE]),       # shares the director with #1
    ]
    pair = pick_battle_pair(items, CAST_DEPTH)
    assert (pair.left_rank, pair.right_rank) == (1, 3)
    assert pair.kind == "director"
    assert pair.person.title == "Christopher Nolan"
    assert pair.category == "movie"
    assert pair.pair_count == 3


def test_battle_pair_falls_back_to_actor():
    pair = pick_battle_pair([movie([NOLAN], [DICAPRIO]), movie([SCORSESE], [DICAPRIO])], CAST_DEPTH)
    assert pair.kind == "actor"
    assert pair.label_fa == "بازیگر مشترک"


def test_battle_pair_none_when_unrelated_or_mixed_types():
    # Only a shared genre -> not a battle.
    assert pick_battle_pair([movie([NOLAN], genres=[SCIFI]), movie([SCORSESE], genres=[SCIFI])], CAST_DEPTH) is None
    # Same person, but a movie can't battle a series.
    film = movie([NOLAN])
    series = movie(creators=[NOLAN], entity_type="tv_series")
    assert pick_battle_pair([film, series], CAST_DEPTH) is None
