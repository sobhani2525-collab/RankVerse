from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import envelope
from app.modules.auth.dependencies import get_current_user
from app.modules.users.models import User
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import RatingCreate, RatingPublic
from app.modules.users.service import UserService

router = APIRouter(tags=["users"])


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


@router.get("/users/me/ratings")
async def my_ratings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ratings = await UserRepository(db).list_ratings_with_movies(current_user.id)
    return envelope(data=[RatingPublic.model_validate(r).model_dump() for r in ratings])
