from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, get_read_db
from app.core.exceptions import NotFoundError
from app.core.schemas import envelope
from app.modules.auth.dependencies import get_current_user, get_current_user_read
from app.modules.users.models import User
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import (
    FavoritePublic, ProfileUpdate, RatingCreate, RatingPublic, UserProfilePublic, UserPublic, WatchedToggle,
)
from app.modules.users.service import UserService
from app.modules.users.similar import similar_users, toggle_follow
import uuid

router = APIRouter(tags=["users"])


@router.patch("/users/me")
async def update_my_profile(
    payload: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Only fields the client actually sent (an explicit null clears one).
    fields = {name: getattr(payload, name) for name in payload.model_fields_set}
    await UserRepository(db).update_profile(current_user, fields)
    await db.commit()
    return envelope(data=UserPublic.model_validate(current_user).model_dump())


@router.get("/users/similar")
async def get_similar_users(
    limit: int = 8,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_read_db),
):
    return envelope(data=await similar_users(db, current_user.id, max(1, min(limit, 20))))


@router.post("/users/{user_id}/follow")
async def follow_user(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    state = await toggle_follow(db, current_user.id, user_id)
    if state is None:
        raise NotFoundError("User not found")
    await db.commit()
    return envelope(data={"following": state})


@router.get("/users/{username}")
async def get_public_user(username: str, db: AsyncSession = Depends(get_read_db)):
    user = await UserRepository(db).get_by_username(username)
    if not user:
        raise NotFoundError(f"User '{username}' not found")
    return envelope(data=UserProfilePublic.model_validate(user).model_dump())


@router.post("/movies/{slug}/rate")
async def rate_movie(
    slug: str,
    payload: RatingCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = UserService(db)
    rating = await service.rate_movie(current_user.id, slug, payload.score)
    return envelope(data=RatingPublic.model_validate(rating).model_dump())


@router.delete("/movies/{slug}/rate")
async def unrate_movie(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = UserService(db)
    deleted = await service.unrate_movie(current_user.id, slug)
    return envelope(data={"deleted": deleted})


@router.post("/tv-series/{slug}/rate")
async def rate_tv_series(
    slug: str,
    payload: RatingCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = UserService(db)
    rating = await service.rate_tv_series(current_user.id, slug, payload.score)
    return envelope(data=RatingPublic.model_validate(rating).model_dump())


@router.delete("/tv-series/{slug}/rate")
async def unrate_tv_series(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = UserService(db)
    deleted = await service.unrate_tv_series(current_user.id, slug)
    return envelope(data={"deleted": deleted})


@router.get("/users/me/ratings")
async def my_ratings(
    current_user: User = Depends(get_current_user_read),
    db: AsyncSession = Depends(get_read_db),
):
    ratings = await UserRepository(db).list_ratings_with_movies(current_user.id)
    return envelope(data=[RatingPublic.model_validate(r).model_dump() for r in ratings])


@router.get("/users/me/watched")
async def my_watched(
    current_user: User = Depends(get_current_user_read),
    db: AsyncSession = Depends(get_read_db),
):
    """Entity ids the caller marked "تماشا کرده‌ام" -- the button's initial state."""
    ids = await UserRepository(db).list_watched_entity_ids(current_user.id)
    return envelope(data={"entity_ids": [str(i) for i in ids]})


@router.post("/users/me/watched/toggle")
async def toggle_watched(
    payload: WatchedToggle,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    watched = await UserRepository(db).toggle_watched(current_user.id, payload.entity_id)
    await db.commit()
    return envelope(data={"watched": watched})


@router.post("/movies/{slug}/favorite")
async def favorite_movie(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = UserService(db)
    favorited = await service.favorite_movie(current_user.id, slug)
    return envelope(data={"favorited": favorited})


@router.post("/tv-series/{slug}/favorite")
async def favorite_tv_series(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = UserService(db)
    favorited = await service.favorite_tv_series(current_user.id, slug)
    return envelope(data={"favorited": favorited})


@router.post("/persons/{slug}/favorite")
async def favorite_person(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = UserService(db)
    favorited = await service.toggle_favorite(current_user.id, slug, entity_type="person")
    return envelope(data={"favorited": favorited})


@router.get("/users/me/favorites")
async def my_favorites(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    favorites = await UserRepository(db).list_favorites_with_movies(current_user.id)
    return envelope(data=[FavoritePublic.model_validate(f).model_dump() for f in favorites])
