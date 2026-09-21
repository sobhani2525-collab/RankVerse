"""
Tests for the ♥ favorite feature: UserFavorite is a deliberately separate,
lighter-weight signal from UserRating (see UserFavorite's docstring in
app/modules/users/models.py) that still nudges Taste DNA's genre
dimensions -- via TasteDimensionComputer._favorited_unrated_genre_slugs_for_user
-- without ever double-counting an entity the user has also rated.

Run with: TEST_DATABASE_URL=... pytest tests/test_favorites.py
"""
import uuid

from app.modules.entities.repository import EntityRepository
from app.modules.taste.compute import TasteDimensionComputer
from app.modules.taste.repository import TasteRepository
from app.modules.users.repository import UserRepository
from app.modules.users.service import UserService


async def _create_entity(repo: EntityRepository, entity_type: str, title: str):
    return await repo.create_entity(
        entity_type=entity_type,
        external_id=None,
        external_source=None,
        title=title,
        slug=f"{title.lower().replace(' ', '-')}-{uuid.uuid4().hex[:8]}",
        attributes={},
    )


# --- toggle via API ---


async def test_toggle_favorite_via_api(client, db_session, auth_headers):
    repo = EntityRepository(db_session)
    movie = await _create_entity(repo, "movie", "Favorite Toggle Movie")
    await db_session.commit()

    res = await client.post(f"/api/v1/movies/{movie.slug}/favorite", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["data"]["favorited"] is True

    listing = await client.get("/api/v1/users/me/favorites", headers=auth_headers)
    slugs = [f["movie_slug"] for f in listing.json()["data"]]
    assert movie.slug in slugs

    res2 = await client.post(f"/api/v1/movies/{movie.slug}/favorite", headers=auth_headers)
    assert res2.status_code == 200
    assert res2.json()["data"]["favorited"] is False

    listing2 = await client.get("/api/v1/users/me/favorites", headers=auth_headers)
    assert listing2.json()["data"] == []


async def test_toggle_favorite_tv_series_via_api(client, db_session, auth_headers):
    repo = EntityRepository(db_session)
    show = await _create_entity(repo, "tv_series", "Favorite Toggle Show")
    await db_session.commit()

    res = await client.post(f"/api/v1/tv-series/{show.slug}/favorite", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["data"]["favorited"] is True


async def test_favorite_unknown_slug_404s(client, auth_headers):
    res = await client.post("/api/v1/movies/does-not-exist/favorite", headers=auth_headers)
    assert res.status_code == 404


# --- Taste DNA integration: genre dimensions ---


async def test_favorited_unrated_genre_slugs_excludes_already_rated_entities(db_session, test_user):
    """
    The core "no double counting" guarantee: an entity the user has BOTH
    favorited and rated must show up only through the (stronger) rating
    signal, never also as a favorite pseudo-score for the same movie.
    """
    entity_repo = EntityRepository(db_session)
    genre = await _create_entity(entity_repo, "genre", "Drama")
    rated_and_favorited = await _create_entity(entity_repo, "movie", "Rated And Favorited")
    favorited_only = await _create_entity(entity_repo, "movie", "Favorited Only")
    await entity_repo.create_relationship(rated_and_favorited.id, genre.id, "has_genre")
    await entity_repo.create_relationship(favorited_only.id, genre.id, "has_genre")
    await db_session.commit()

    user_repo = UserRepository(db_session)
    await user_repo.upsert_rating(test_user.id, rated_and_favorited.id, 3)
    await user_repo.add_favorite(test_user.id, rated_and_favorited.id)
    await user_repo.add_favorite(test_user.id, favorited_only.id)
    await db_session.commit()

    computer = TasteDimensionComputer(db_session)
    slugs = await computer._favorited_unrated_genre_slugs_for_user(test_user.id)

    assert slugs == [genre.slug]  # only the favorited-only movie's genre, once


async def test_favorite_contributes_to_genre_dimension_for_favorites_only_user(db_session, test_user):
    """
    A user with zero ratings but several favorites in the same genre
    should still get a genre dimension -- proving favorites alone can
    clear the confidence threshold, using the scale-midpoint fallback
    baseline (no ratings exist to compute a personal average from).
    """
    entity_repo = EntityRepository(db_session)
    taste_repo = TasteRepository(db_session)
    genre = await _create_entity(entity_repo, "genre", "Sci-Fi")

    user_repo = UserRepository(db_session)
    for i in range(6):  # enough sample_size to clear taste_dimension_confidence_threshold
        movie = await _create_entity(entity_repo, "movie", f"Scifi Favorite {i}")
        await entity_repo.create_relationship(movie.id, genre.id, "has_genre")
        await user_repo.add_favorite(test_user.id, movie.id)
    await db_session.commit()

    count = await TasteDimensionComputer(db_session).compute_genre_dimensions(test_user.id)
    await db_session.commit()
    assert count == 1

    dimensions = await taste_repo.list_dimensions(test_user.id, dimension_type="genre")
    assert len(dimensions) == 1
    assert dimensions[0].dimension_key == genre.slug
    assert dimensions[0].sample_size == 6
    # score > 50 -- a favorite pseudo-score (4/5) sits above the 3.0
    # neutral-midpoint baseline used when there's no explicit rating avg.
    assert dimensions[0].score > 50


async def test_unrated_unfavorited_genre_gets_no_dimension(db_session, test_user):
    count = await TasteDimensionComputer(db_session).compute_genre_dimensions(test_user.id)
    assert count == 0


# --- unfavorite triggers a Taste DNA recompute too ---


async def test_unfavorite_via_service_removes_dimension_contribution(db_session, test_user):
    entity_repo = EntityRepository(db_session)
    genre = await _create_entity(entity_repo, "genre", "Horror")
    movies = []
    for i in range(6):
        movie = await _create_entity(entity_repo, "movie", f"Horror Favorite {i}")
        await entity_repo.create_relationship(movie.id, genre.id, "has_genre")
        movies.append(movie)
    await db_session.commit()

    service = UserService(db_session)
    for movie in movies:
        await service.toggle_favorite(test_user.id, movie.slug, entity_type="movie")

    taste_repo = TasteRepository(db_session)
    dimensions = await taste_repo.list_dimensions(test_user.id, dimension_type="genre")
    assert len(dimensions) == 1

    # Unfavorite all of them again -- the dimension should disappear since
    # there's no longer any qualifying signal for this genre.
    for movie in movies:
        await service.toggle_favorite(test_user.id, movie.slug, entity_type="movie")

    dimensions_after = await taste_repo.list_dimensions(test_user.id, dimension_type="genre")
    assert dimensions_after == []
