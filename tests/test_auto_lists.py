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


@pytest.fixture
async def seeded(db_session, monkeypatch):
    for email in EMAILS:
        db_session.add(User(email=email, username=email.split("@")[0], hashed_password="x"))
    genres = {}
    for name in ("Crime", "Drama", "Comedy"):
        genres[name] = Entity(entity_type="genre", title=name, slug=f"genre-{name.lower()}", attributes={})
    actor = Entity(entity_type="person", title="Al", slug="al", attributes={"title_fa": "آل پاچینو"})
    db_session.add_all([*genres.values(), actor])
    await db_session.flush()
    db_session.add(PersonStats(person_id=actor.id, role="actor", origin="all", works=30, scored=30, avg_score=7.0, shrunk=7.0))
    for i in range(36):
        movie = Entity(entity_type="movie", title=f"Movie {i}", slug=f"movie-{i}", attributes={"year": 1990 + i % 10})
        db_session.add(movie)
        await db_session.flush()
        genre = genres[("Crime", "Drama", "Comedy")[i % 3]]
        db_session.add_all([
            EntityRanking(entity_id=movie.id, computed_score=9.0 - i * 0.05, total_votes=10),
            RelationshipEdge(from_entity_id=movie.id, to_entity_id=genre.id, relation_type="has_genre"),
            RelationshipEdge(from_entity_id=movie.id, to_entity_id=actor.id, relation_type="acted_in"),
        ])
    await db_session.commit()
    monkeypatch.setattr(settings, "auto_lists_enabled", True)
    monkeypatch.setattr(settings, "auto_battles_enabled", True)
    monkeypatch.setattr(settings, "auto_lists_user_emails", ",".join(EMAILS))
    monkeypatch.setattr(settings, "auto_lists_per_day", 3)
    monkeypatch.setattr(settings, "auto_battles_per_day", 3)


async def test_lists_are_created_up_to_the_daily_quota(db_session, seeded):
    made = [await auto_lists.create_daily_list(db_session, LATE) for _ in range(5)]
    assert sum(x is not None for x in made) == 3
    lists = (await db_session.execute(select(UserList).where(UserList.curation_note.like("auto:2026-10-28:%")))).scalars().all()
    assert {lst.curation_note for lst in lists} == {f"auto:2026-10-28:{k}" for k in range(3)}
    owners = {u.id for u in (await db_session.execute(select(User))).scalars()}
    for lst in lists:
        assert lst.visibility == "public" and lst.user_id in owners
        assert len(lst.tags) == 2 and lst.description
        count = (await db_session.execute(
            select(func.count()).select_from(UserListItem).where(UserListItem.list_id == lst.id)
        )).scalar_one()
        assert auto_lists.MIN_ITEMS <= count <= auto_lists.MAX_ITEMS
    assert len({tuple(lst.tags) for lst in lists}) == 3  # no theme twice


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
