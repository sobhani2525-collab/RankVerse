from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, get_read_db
from app.core.exceptions import NotFoundError
from app.core.schemas import envelope
from app.modules.auth.dependencies import get_current_user
from app.modules.users.models import User
from app.modules.users.repository import UserRepository
from app.modules.taste.predicted_picks import PredictedPicksService
from app.modules.taste.schemas import PredictedPickPublic, TasteAnchorEntity
from app.modules.taste.service import TasteService

router = APIRouter(tags=["taste"])


@router.get("/users/me/taste-dna")
async def my_taste_dna(
    entity_scope: str = Query("movie"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = TasteService(db)
    profile = await service.get_taste_profile(current_user.id, entity_scope)
    return envelope(data=profile.model_dump())


@router.get("/users/me/predicted-picks")
async def my_predicted_picks(
    limit: int = Query(3, ge=1, le=10),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Separate from GET /users/me/taste-dna on purpose: that endpoint is a
    handful of cheap single-table reads of already-persisted derived data
    (see TasteService.get_taste_profile), while this runs a multi-join,
    genre-scored candidate query live on every call (no persisted
    predicted-picks table -- "not rated yet" only means something at read
    time). Keeping it separate means the core profile load never pays for
    this heavier query, and the frontend can fetch/show it lazily.
    """
    service = PredictedPicksService(db)
    picks = await service.get_predicted_picks(current_user.id, limit=limit)
    return envelope(
        data=[
            PredictedPickPublic(
                entity=TasteAnchorEntity(
                    id=pick.entity.id,
                    slug=pick.entity.slug,
                    title=pick.entity.title,
                    entity_type=pick.entity.entity_type,
                    poster_path=pick.entity.attributes.get("poster_path"),
                    title_fa=pick.entity.attributes.get("title_fa"),
                ),
                match_score=pick.match_score,
            ).model_dump()
            for pick in picks
        ]
    )


@router.get("/users/{username}/taste-dna")
async def public_taste_dna(
    username: str,
    entity_scope: str = Query("movie"),
    db: AsyncSession = Depends(get_read_db),
):
    """Same payload as /users/me/taste-dna, for a public profile page."""
    user = await UserRepository(db).get_by_username(username)
    if not user:
        raise NotFoundError(f"User '{username}' not found")
    profile = await TasteService(db).get_taste_profile(user.id, entity_scope)
    return envelope(data=profile.model_dump())
