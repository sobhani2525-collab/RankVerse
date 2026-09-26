from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, get_read_db
from app.core.exceptions import NotFoundError
from app.core.schemas import envelope
from app.modules.auth.dependencies import get_current_user
from app.modules.users.models import User
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import FavoritePublic, RatingCreate, RatingPublic, UserProfilePublic
from app.modules.users.service import UserService

router = APIRouter(tags=["users"])


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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ratings = await UserRepository(db).list_ratings_with_movies(current_user.id)
    return envelope(data=[RatingPublic.model_validate(r).model_dump() for r in ratings])


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
