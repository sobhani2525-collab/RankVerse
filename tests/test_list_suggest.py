"""
Unit tests for add-item suggestions (app/modules/lists/suggest.py).
Pure functions -- no database needed.
Run with: pytest tests/test_list_suggest.py
"""
import uuid

from app.modules.lists.graph import GraphItem
from app.modules.lists.schemas import EntityRef
from app.modules.lists.suggest import build_profile, explain_candidate

CAST_DEPTH = 3


def ref(name: str, entity_type: str = "person") -> EntityRef:
    return EntityRef(id=uuid.uuid5(uuid.NAMESPACE_DNS, name), slug=name.lower(), title=name, entity_type=entity_type)


COMEDY, DRAMA = ref("Comedy", "genre"), ref("Drama", "genre")


def person(name: str, works=(), genres=()) -> GraphItem:
    r = ref(name)
    return GraphItem(
        entity_type="person", entity_id=r.id, ref=r,
        credits={w.id: (w, {"acted_in"}) for w in works}, career_genres=list(genres),
    )


def title(name: str, cast=(), directors=(), genres=(), entity_type="movie") -> GraphItem:
    r = ref(name, entity_type)
    return GraphItem(
        entity_type=entity_type, entity_id=r.id, ref=r, cast=list(cast), directors=list(directors),
        genres=list(genres),
    )


def explain(candidate, items, countries=(), **kw):
    profile = build_profile(items, list(countries) or [None] * len(items))
    return explain_candidate(candidate, items, profile, CAST_DEPTH, **kw)


def test_title_sharing_a_director_names_the_ranks_and_person():
    nolan = ref("Nolan")
    items = [title("A", directors=[nolan]), title("B"), title("C", directors=[nolan])]
    reason = explain(title("D", directors=[nolan]), items)
    assert (reason.kind, reason.strength) == ("people", 3)
    assert reason.text == "متصل به #۱ و #۳ از طریق Nolan"


def test_long_rank_lists_are_shortened():
    nolan = ref("Nolan")
    items = [title(f"T{i}", directors=[nolan]) for i in range(6)]
    assert explain(title("D", directors=[nolan]), items).text.startswith("متصل به #۱ و #۲ و #۳ و ۳ مورد دیگر")


def test_person_candidate_shares_a_work_with_a_listed_person():
    show = ref("Pezhman", "tv_series")
    items = [person("A", works=[show])]
    reason = explain(person("B", works=[show]), items)
    assert (reason.kind, reason.strength, reason.text) == ("people", 2, "هم‌پروژه با #۱ در Pezhman")


def test_person_candidate_credited_on_a_listed_title():
    film = title("Film")
    p = person("B", works=[film.ref])
    reason = explain(p, [film])
    assert reason.text == "در #۱ نقش دارد"


def test_title_candidate_featuring_a_listed_person():
    film = title("Film")
    listed = person("A", works=[film.ref])
    reason = explain(film, [listed])
    assert (reason.kind, reason.text) == ("people", "A (#۱) در این اثر نقش دارد")


def test_genre_only_candidate_is_weaker_than_a_people_link():
    shared = ref("Nolan")
    items = [title("A", directors=[shared], genres=[COMEDY]), title("B", genres=[COMEDY])]
    genre_only = explain(title("C", genres=[COMEDY]), items)
    people = explain(title("D", directors=[shared]), items)
    assert (genre_only.kind, genre_only.strength) == ("genre", 1)
    assert people.score > genre_only.score


def test_person_candidate_matches_on_career_genres():
    items = [person("A", genres=[COMEDY])]
    reason = explain(person("B", genres=[COMEDY, DRAMA]), items)
    assert (reason.kind, reason.strength) == ("genre", 1)


def test_unrelated_candidate_has_no_connection():
    items = [title("A", genres=[DRAMA])]
    reason = explain(title("B", genres=[COMEDY]), items)
    assert (reason.kind, reason.strength) == ("none", 0)


def test_same_country_as_the_list_scores_higher():
    items = [title("A", genres=[COMEDY]), title("B", genres=[COMEDY])]
    iran = explain(title("C", genres=[COMEDY]), items, countries=["IR", "IR"], country="IR")
    abroad = explain(title("D", genres=[COMEDY]), items, countries=["IR", "IR"], country="US")
    assert iran.score > abroad.score
