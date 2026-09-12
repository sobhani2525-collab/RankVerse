from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import envelope
from app.modules.auth.dependencies import get_current_user
from app.modules.users.models import User
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
