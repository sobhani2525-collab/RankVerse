"""
Tests for the genre-v2 Taste DNA model (taste/compute.py): battle votes
feed a genre's win rate instead of a pseudo-rating, a genre's score is
measured against the platform's base rate (so a ubiquitous genre doesn't
top every profile), public profiles get a third-person insight, and the
director/decade facets behind liked titles.

Run with: TEST_DATABASE_URL=... pytest tests/test_taste_v2.py
"""
import uuid

from app.modules.battles.models import PairVote, VoteOutcome
from app.modules.entities.repository import EntityRepository
from app.modules.taste.compute import (
    PERSPECTIVE_OTHER,
    PERSPECTIVE_SELF,
    SNAPSHOT_MODEL_VERSION,
    GenreStat,
    TasteDimensionComputer,
    TasteFacetComputer,
    build_insight,
    load_genre_stats,
)
from app.modules.taste.refresh import recompute_taste_dna
from app.modules.taste.repository import TasteRepository
from app.modules.users.models import UserRating
from app.modules.users.repository import UserRepository


async def _entity(repo, entity_type, title, attributes=None):
    return await repo.create_entity(
        entity_type=entity_type, external_id=None, external_source=None,
        title=title, slug=f"{title.lower().replace(' ', '-')}-{uuid.uuid4().hex[:8]}",
        attributes=attributes or {},
    )


async def _movie(repo, title, genre, attributes=None):
    movie = await _entity(repo, "movie", title, attributes)
    await repo.create_relationship(movie.id, genre.id, "has_genre")
    return movie


async def test_battle_wins_are_not_below_a_generous_raters_average(db_session, test_user):
    """The genre-v1 bug: two 5-star ratings set the user's average to 5, so
    every battle win (worth 4 stars) dragged its genres *down*."""
    repo = EntityRepository(db_session)
    drama = await _entity(repo, "genre", "Drama")
    comedy = await _entity(repo, "genre", "Comedy")
    rated = [await _movie(repo, f"Rated {i}", drama) for i in range(2)]
    for movie in rated:
        db_session.add(UserRating(user_id=test_user.id, entity_id=movie.id, score=5))
    for i in range(8):
        winner = await _movie(repo, f"Drama Winner {i}", drama)
        loser = await _movie(repo, f"Comedy Loser {i}", comedy)
        db_session.add(
            PairVote(user_id=test_user.id, category="movie", left_item=winner.id, right_item=loser.id,
                     winner=VoteOutcome.LEFT)
        )
    await db_session.commit()

    await TasteDimensionComputer(db_session).compute_genre_dimensions(test_user.id)
    stats = {s.dimension_key: s for s in await load_genre_stats(TasteRepository(db_session), test_user.id)}

    assert stats[drama.slug].affinity > 0.7
    assert stats[comedy.slug].affinity < 0.3
    assert stats[drama.slug].score > 50 > stats[comedy.slug].score
    # Two ratings are too few to claim how often they pick a genre.
    assert stats[drama.slug].lift is None


async def test_a_genre_everyone_watches_does_not_outrank_a_distinctive_one(db_session, test_user):
    """Equal ratings, but drama is what the whole platform rates while horror
    is this user's own thing: horror's lift (and so its score) must win."""
    repo = EntityRepository(db_session)
    drama = await _entity(repo, "genre", "Drama")
    horror = await _entity(repo, "genre", "Horror")
    crowd = await UserRepository(db_session).create(
        email="crowd@example.com", username="crowd", hashed_password="x"
    )
    for i in range(30):
        movie = await _movie(repo, f"Crowd Drama {i}", drama)
        db_session.add(UserRating(user_id=crowd.id, entity_id=movie.id, score=4))
    for i in range(6):
        movie = await _movie(repo, f"My Drama {i}", drama)
        db_session.add(UserRating(user_id=test_user.id, entity_id=movie.id, score=4))
    for i in range(6):
        movie = await _movie(repo, f"My Horror {i}", horror)
        db_session.add(UserRating(user_id=test_user.id, entity_id=movie.id, score=4))
    await db_session.commit()

    await TasteDimensionComputer(db_session).compute_genre_dimensions(test_user.id)
    stats = await load_genre_stats(TasteRepository(db_session), test_user.id)

    assert stats[0].dimension_key == horror.slug
    by_key = {s.dimension_key: s for s in stats}
    assert by_key[horror.slug].lift > 1.3 > by_key[drama.slug].lift


def test_insight_perspectives():
    stats = [
        GenreStat("horror", 80, 0.6, 12, affinity=0.75, lift=2.4),
        GenreStat("comedy", 30, 0.5, 8, affinity=0.3, lift=0.8),
    ]
    mine, _ = build_insight(stats, PERSPECTIVE_SELF)
    theirs, _ = build_insight(stats, PERSPECTIVE_OTHER)
    assert "ترسناک" in mine and "۲٫۴" in mine and "انتخاب می‌کنی" in mine
    assert "انتخاب می‌کنه" in theirs and "می‌کنی" not in theirs and "دلت" not in theirs
    assert "کمدی" in mine


async def test_public_taste_dna_speaks_in_the_third_person(client, db_session, test_user):
    repo = EntityRepository(db_session)
    horror = await _entity(repo, "genre", "Horror")
    for i, score in enumerate([5, 5, 5, 4, 4, 2]):
        movie = await _movie(repo, f"Horror {i}", horror)
        db_session.add(UserRating(user_id=test_user.id, entity_id=movie.id, score=score))
    await db_session.commit()
    await recompute_taste_dna(db_session, test_user.id)
    await db_session.commit()

    res = await client.get(f"/api/v1/users/{test_user.username}/taste-dna")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["snapshot"]["model_version"] == SNAPSHOT_MODEL_VERSION
    text = data["insight"]["insight_text"]
    assert "می‌کنی" not in text and "دلت" not in text and "انتخاب‌هات" not in text
    assert data["dimensions"][0]["affinity"] is not None
    assert all(d["dimension_type"] == "genre" for d in data["dimensions"])
    assert data["rating_style"]["ratings_count"] == 6


async def test_facets_find_the_director_and_decade_behind_liked_titles(db_session, test_user):
    repo = EntityRepository(db_session)
    drama = await _entity(repo, "genre", "Drama")
    director = await _entity(repo, "person", "Favorite Director")
    for i in range(5):
        movie = await _movie(repo, f"Nineties {i}", drama, {"year": 1990 + i, "country": "US"})
        if i < 3:
            await repo.create_relationship(movie.id, director.id, "directed_by")
        db_session.add(UserRating(user_id=test_user.id, entity_id=movie.id, score=4))
    await db_session.commit()

    await TasteFacetComputer(db_session).compute_facets(test_user.id)
    taste_repo = TasteRepository(db_session)
    directors = await taste_repo.list_dimensions(test_user.id, "director")
    decades = await taste_repo.list_dimensions(test_user.id, "decade")
    countries = await taste_repo.list_dimensions(test_user.id, "country")

    assert [d.dimension_key for d in directors] == [str(director.id)]
    assert directors[0].sample_size == 3
    assert decades[0].dimension_key == "1990" and decades[0].score == 100
    assert countries[0].dimension_key == "US"


async def test_good_films_winning_battles_is_not_a_genre_taste(db_session, test_user):
    """Music titles here are all far better rated than their opponents, so
    picking them is what anyone would do -- it must not read as a strong
    taste for music the way an even-matchup win would."""
    from app.modules.entities.models import EntityRanking

    repo = EntityRepository(db_session)
    music = await _entity(repo, "genre", "Music")
    western = await _entity(repo, "genre", "Western")
    for i in range(8):
        acclaimed = await _movie(repo, f"Acclaimed Music {i}", music)
        mediocre = await _movie(repo, f"Mediocre Opponent {i}", western)
        db_session.add(EntityRanking(entity_id=acclaimed.id, computed_score=8.6, total_votes=100))
        db_session.add(EntityRanking(entity_id=mediocre.id, computed_score=5.2, total_votes=100))
        db_session.add(
            PairVote(user_id=test_user.id, category="movie", left_item=acclaimed.id, right_item=mediocre.id,
                     winner=VoteOutcome.LEFT)
        )
    await db_session.commit()

    await TasteDimensionComputer(db_session).compute_genre_dimensions(test_user.id)
    stats = {s.dimension_key: s for s in await load_genre_stats(TasteRepository(db_session), test_user.id)}

    assert stats[music.slug].affinity < 0.6
    assert stats[western.slug].affinity > 0.4


async def test_genre_rows_carry_example_titles(client, db_session, test_user):
    repo = EntityRepository(db_session)
    horror = await _entity(repo, "genre", "Horror")
    titles = []
    for i, score in enumerate([5, 5, 4, 4, 4, 1]):
        movie = await _movie(repo, f"Example Horror {i}", horror)
        titles.append(movie)
        db_session.add(UserRating(user_id=test_user.id, entity_id=movie.id, score=score))
    await db_session.commit()
    await recompute_taste_dna(db_session, test_user.id)
    await db_session.commit()

    data = (await client.get(f"/api/v1/users/{test_user.username}/taste-dna")).json()["data"]
    examples = data["dimensions"][0]["examples"]
    assert len(examples) == 3
    assert {e["slug"] for e in examples} <= {t.slug for t in titles[:2]} | {t.slug for t in titles[2:5]}
    assert titles[5].slug not in {e["slug"] for e in examples}  # rated below their average
    assert examples[0]["slug"] in {titles[0].slug, titles[1].slug}
