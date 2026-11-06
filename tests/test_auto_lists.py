"""Daily auto lists and battles, end to end against a real database.

Run with: TEST_DATABASE_URL=... pytest tests/test_auto_lists.py
"""
from datetime import datetime, timezone

import pytest
from sqlalchemy import func, select

from app.config import settings
from app.modules.auto_lists import battles as auto_battles
from app.modules.auto_lists import service as auto_lists
from app.modules.battles.tournament_models import Battle, BattleParticipant
from app.modules.entities.models import Entity, EntityRanking, PersonStats, RelationshipEdge
from app.modules.lists.models import UserList, UserListItem
from app.modules.users.models import User

EMAILS = ["a@example.com", "b@example.com", "c@example.com"]
LATE = datetime(2026, 10, 28, 19, 0, tzinfo=timezone.utc)  # 22:30 Tehran: every slot is due
EARLY = datetime(2026, 10, 28, 0, 1, tzinfo=timezone.utc)  # 03:31 Tehran: nothing is due


def IR(i: int) -> dict:
    """Every other title is Iranian (original language Persian)."""
    return {"original_language": "fa"} if i % 2 == 0 else {}


@pytest.fixture
async def seeded(db_session, monkeypatch):
    for email in EMAILS:
        db_session.add(User(email=email, username=email.split("@")[0], hashed_password="x"))
    genres = {}
    for name in ("Crime", "Drama", "Comedy"):
        genres[name] = Entity(entity_type="genre", title=name, slug=f"genre-{name.lower()}", attributes={})
    actor = Entity(entity_type="person", title="Al", slug="al", attributes={"title_fa": "آل پاچینو"})
    ir_actor = Entity(entity_type="person", title="Pa", slug="pa", attributes={"title_fa": "پرویز پرستویی"})
    db_session.add_all([*genres.values(), actor, ir_actor])
    await db_session.flush()
    db_session.add(PersonStats(person_id=ir_actor.id, role="actor", origin="persian", works=20, scored=20, avg_score=7.0, shrunk=7.0))
    db_session.add(PersonStats(person_id=actor.id, role="actor", origin="all", works=30, scored=30, avg_score=7.0, shrunk=7.0))
    for i in range(36):
        movie = Entity(entity_type="movie", title=f"Movie {i}", slug=f"movie-{i}", attributes={"year": 1990 + i % 10, **IR(i)})
        db_session.add(movie)
        await db_session.flush()
        genre = genres[("Crime", "Drama", "Comedy")[i % 3]]
        db_session.add_all([
            EntityRanking(entity_id=movie.id, computed_score=9.0 - i * 0.05, total_votes=10),
            RelationshipEdge(from_entity_id=movie.id, to_entity_id=genre.id, relation_type="has_genre"),
            RelationshipEdge(from_entity_id=movie.id, to_entity_id=actor.id, relation_type="acted_in"),
        ])
        if i % 2 == 0:
            db_session.add(RelationshipEdge(from_entity_id=movie.id, to_entity_id=ir_actor.id, relation_type="acted_in"))
    for i in range(30):
        series = Entity(entity_type="tv_series", title=f"Show {i}", slug=f"show-{i}", attributes={"year": 1990 + i % 10, **IR(i)})
        db_session.add(series)
        await db_session.flush()
        genre = genres[("Crime", "Drama", "Comedy")[i % 3]]
        db_session.add_all([
            EntityRanking(entity_id=series.id, computed_score=8.5 - i * 0.05, total_votes=10),
            RelationshipEdge(from_entity_id=series.id, to_entity_id=genre.id, relation_type="has_genre"),
            RelationshipEdge(from_entity_id=series.id, to_entity_id=actor.id, relation_type="acted_in"),
        ])
        if i % 2 == 0:
            db_session.add(RelationshipEdge(from_entity_id=series.id, to_entity_id=ir_actor.id, relation_type="acted_in"))
    for i in range(10):
        person = Entity(entity_type="person", title=f"Person {i}", slug=f"person-{i}", attributes={})
        db_session.add(person)
        await db_session.flush()
        for role, origin in (("actor", "persian"), ("actor", "foreign"), ("director", "persian"), ("director", "foreign")):
            db_session.add(PersonStats(
                person_id=person.id, role=role, origin=origin, works=25 if i < 7 else 2, scored=5, avg_score=7.0, shrunk=7.0 - i * 0.1,  # the last three are little known
            ))
    await db_session.commit()
    monkeypatch.setattr(settings, "auto_lists_enabled", True)
    monkeypatch.setattr(settings, "auto_battles_enabled", True)
    monkeypatch.setattr(settings, "auto_lists_user_emails", ",".join(EMAILS))
    monkeypatch.setattr(settings, "auto_lists_per_day", 3)
    monkeypatch.setattr(settings, "auto_battles_per_day", 3)
    monkeypatch.setattr(settings, "auto_curated_only", False)  # the full mix; one test turns it on


async def test_lists_are_created_up_to_the_daily_quota(db_session, seeded):
    made = [await auto_lists.create_daily_list(db_session, LATE) for _ in range(5)]
    assert sum(x is not None for x in made) == 3
    lists = (await db_session.execute(select(UserList).where(UserList.curation_note.like("auto:2026-10-28:%")))).scalars().all()
    assert {lst.curation_note.split("|")[0] for lst in lists} == {f"auto:2026-10-28:{k}" for k in range(3)}
    owners = {u.id for u in (await db_session.execute(select(User))).scalars()}
    for lst in lists:
        assert lst.visibility == "public" and lst.user_id in owners
        assert 2 <= len(lst.tags) <= 3 and lst.description
        count = (await db_session.execute(
            select(func.count()).select_from(UserListItem).where(UserListItem.list_id == lst.id)
        )).scalar_one()
        assert auto_lists.MIN_ITEMS <= count <= auto_lists.MAX_ITEMS
    assert len({lst.curation_note.split("|")[1] for lst in lists}) == 3  # no theme twice


async def test_battles_are_created_up_to_the_daily_quota(db_session, seeded):
    made = [await auto_battles.create_daily_battle(db_session, LATE) for _ in range(5)]
    assert sum(x is not None for x in made) == 3
    battles = (await db_session.execute(select(Battle))).scalars().all()
    assert len(battles) == 3
    for battle in battles:
        assert battle.mode == "pool" and battle.status == "active" and battle.visibility == "public"
        assert battle.bracket_size in (4, 8, 16)
        entrants = (await db_session.execute(
            select(func.count()).select_from(BattleParticipant).where(BattleParticipant.battle_id == battle.id)
        )).scalar_one()
        assert entrants == battle.bracket_size
    assert len({b.curation_note.split("|")[1] for b in battles}) == 3  # no theme twice


async def test_nothing_is_created_before_the_slot_hour_or_when_disabled(db_session, seeded, monkeypatch):
    assert await auto_lists.create_daily_list(db_session, EARLY) is None
    assert await auto_battles.create_daily_battle(db_session, EARLY) is None
    monkeypatch.setattr(settings, "auto_lists_enabled", False)
    monkeypatch.setattr(settings, "auto_battles_enabled", False)
    assert await auto_lists.create_daily_list(db_session, LATE) is None
    assert await auto_battles.create_daily_battle(db_session, LATE) is None


async def test_unknown_emails_are_skipped(db_session, seeded, monkeypatch):
    monkeypatch.setattr(settings, "auto_lists_user_emails", "nobody@example.com")
    assert await auto_lists.create_daily_list(db_session, LATE) is None
    monkeypatch.setattr(settings, "auto_lists_user_emails", "nobody@example.com, a@example.com")
    lst = await auto_lists.create_daily_list(db_session, LATE)
    owner = (await db_session.execute(select(User).where(User.id == lst.user_id))).scalar_one()
    assert owner.email == "a@example.com"


async def test_lists_cover_series_mixed_and_people_over_many_days(db_session, seeded, monkeypatch):
    monkeypatch.setattr(settings, "auto_lists_per_day", 3)
    seen = set()
    for day in range(1, 29):
        now = datetime(2026, 11, day, 19, 0, tzinfo=timezone.utc)
        for _ in range(3):
            await auto_lists.create_daily_list(db_session, now)
    lists = (await db_session.execute(select(UserList).where(UserList.curation_note.like("auto:%")))).scalars().all()
    for lst in lists:
        seen.add(lst.entity_type)
        types = set((await db_session.execute(
            select(UserListItem.entity_type).where(UserListItem.list_id == lst.id)
        )).scalars())
        if lst.entity_type is None:
            assert types == {"movie", "tv_series"}  # a mixed list really mixes both
        else:
            assert types == {lst.entity_type}
    assert {"movie", "tv_series", "person", None} <= seen
    assert len({lst.curation_note.split("|")[1] for lst in lists}) == len(lists)  # no theme twice


async def test_battles_cover_movies_and_series(db_session, seeded, monkeypatch):
    monkeypatch.setattr(settings, "auto_battles_per_day", 3)
    for day in range(1, 15):
        now = datetime(2026, 11, day, 19, 0, tzinfo=timezone.utc)
        for _ in range(3):
            await auto_battles.create_daily_battle(db_session, now)
    battles = (await db_session.execute(select(Battle))).scalars().all()
    assert {b.entity_type for b in battles} == {"movie", "tv_series"}
    for battle in battles:
        types = set((await db_session.execute(
            select(Entity.entity_type).join(BattleParticipant, BattleParticipant.entity_id == Entity.id)
            .where(BattleParticipant.battle_id == battle.id)
        )).scalars())
        assert types == {battle.entity_type}  # same type throughout, as the battle engine requires


async def test_persian_share_one_makes_only_iranian_lists_and_battles(db_session, seeded, monkeypatch):
    monkeypatch.setattr(settings, "auto_persian_share", 1.0)
    for day in range(1, 8):
        now = datetime(2026, 11, day, 19, 0, tzinfo=timezone.utc)
        for _ in range(3):
            await auto_lists.create_daily_list(db_session, now)
            await auto_battles.create_daily_battle(db_session, now)
    lists = (await db_session.execute(select(UserList))).scalars().all()
    battles = (await db_session.execute(select(Battle))).scalars().all()
    assert lists and battles
    work_ids = [
        r for r in (await db_session.execute(
            select(Entity.attributes["original_language"].as_string(), Entity.entity_type)
            .join(UserListItem, UserListItem.entity_id == Entity.id)
            .where(Entity.entity_type.in_(["movie", "tv_series"]))
        )).all()
    ]
    assert work_ids and all(lang == "fa" for lang, _ in work_ids)
    assert any("ایرانی" in (b.title or "") for b in battles)


async def test_little_known_people_never_appear(db_session, seeded, monkeypatch):
    monkeypatch.setattr(settings, "auto_persian_share", 0.5)
    for day in range(1, 29):
        now = datetime(2026, 11, day, 19, 0, tzinfo=timezone.utc)
        for _ in range(3):
            await auto_lists.create_daily_list(db_session, now)
    titles = set((await db_session.execute(
        select(Entity.title).join(UserListItem, UserListItem.entity_id == Entity.id)
        .where(Entity.entity_type == "person")
    )).scalars())
    assert titles  # people lists were made
    assert not titles & {"Person 7", "Person 8", "Person 9"}


async def test_concept_lists_use_only_catalog_titles_found_in_the_database(db_session, seeded, monkeypatch):
    from app.modules.auto_lists.concepts import CONCEPTS_BY_KEY

    concept = CONCEPTS_BY_KEY["twist"]
    present = concept.titles[:9]
    for i, (name, year) in enumerate(present):
        e = Entity(entity_type="movie", title=name, slug=f"twist-{i}", attributes={"year": year})
        db_session.add(e)
        await db_session.flush()
        db_session.add(EntityRanking(entity_id=e.id, computed_score=9.5 - i * 0.1, total_votes=10))
    # same title, different film (a remake): must not be picked
    wrong = Entity(entity_type="movie", title=present[0][0], slug="twist-wrong", attributes={"year": present[0][1] + 30})
    db_session.add(wrong)
    await db_session.flush()
    db_session.add(EntityRanking(entity_id=wrong.id, computed_score=9.9, total_votes=10))
    wrong_id = wrong.id
    await db_session.commit()
    monkeypatch.setattr(settings, "auto_concept_share", 1.0)
    monkeypatch.setattr(settings, "auto_persian_share", 0.0)
    for day in range(1, 6):
        now = datetime(2026, 11, day, 19, 0, tzinfo=timezone.utc)
        for _ in range(3):
            await auto_lists.create_daily_list(db_session, now)
    lists = (await db_session.execute(
        select(UserList).where(UserList.curation_note.like("%|c:twist"))
    )).scalars().all()
    assert len(lists) == 1  # a concept is used once
    ids = set((await db_session.execute(
        select(UserListItem.entity_id).where(UserListItem.list_id == lists[0].id)
    )).scalars())
    assert wrong_id not in ids and len(ids) == 9


async def test_cinema_couple_lists_hold_only_films_of_both(db_session, seeded, monkeypatch):
    ir = (await db_session.execute(select(Entity).where(Entity.slug == "pa"))).scalar_one()
    db_session.add(PersonStats(person_id=ir.id, role="actor", origin="all", works=25, scored=25, avg_score=7.0, shrunk=7.0))
    await db_session.commit()
    monkeypatch.setattr(settings, "auto_duo_share", 1.0)
    monkeypatch.setattr(settings, "auto_concept_share", 0.0)
    monkeypatch.setattr(settings, "auto_persian_share", 0.0)
    monkeypatch.setattr(settings, "auto_battles_per_day", 3)
    for day in range(1, 8):
        now = datetime(2026, 11, day, 19, 0, tzinfo=timezone.utc)
        for _ in range(3):
            await auto_lists.create_daily_list(db_session, now)
            await auto_battles.create_daily_battle(db_session, now)
    duo_lists = (await db_session.execute(select(UserList).where(UserList.curation_note.like("%|duo:%")))).scalars().all()
    duo_battles = (await db_session.execute(select(Battle).where(Battle.curation_note.like("%|duo:%")))).scalars().all()
    assert len(duo_lists) == 1 and len(duo_battles) == 1  # one pair in the seed: used once each
    assert "زوج" in duo_lists[0].title or "و" in duo_lists[0].title
    both = (await db_session.execute(
        select(Entity.attributes["original_language"].as_string()).join(UserListItem, UserListItem.entity_id == Entity.id)
        .where(UserListItem.list_id == duo_lists[0].id)
    )).scalars().all()
    assert both and all(lang == "fa" for lang in both)  # only films the Iranian actor is in (the even ones)


async def test_curated_only_makes_nothing_but_concepts_and_couples(db_session, seeded, monkeypatch):
    ir = (await db_session.execute(select(Entity).where(Entity.slug == "pa"))).scalar_one()
    db_session.add(PersonStats(person_id=ir.id, role="actor", origin="all", works=25, scored=25, avg_score=7.0, shrunk=7.0))
    await db_session.commit()
    monkeypatch.setattr(settings, "auto_curated_only", True)
    monkeypatch.setattr(settings, "auto_persian_share", 0.0)
    for day in range(1, 6):
        now = datetime(2026, 11, day, 19, 0, tzinfo=timezone.utc)
        for _ in range(3):
            await auto_lists.create_daily_list(db_session, now)
            await auto_battles.create_daily_battle(db_session, now)
    notes = [n for (n,) in (await db_session.execute(select(UserList.curation_note))).all()]
    notes += [n for (n,) in (await db_session.execute(select(Battle.curation_note))).all()]
    notes = [n for n in notes if n and n.startswith("auto:")]
    assert notes and all(n.split("|")[1].startswith(("duo:", "c:")) for n in notes)
