from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import envelope
from app.modules.auth.dependencies import get_current_user
from app.modules.users.models import User
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
                ),
                match_score=pick.match_score,
            ).model_dump()
            for pick in picks
        ]
    )
