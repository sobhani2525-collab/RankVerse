from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import envelope, Meta
from app.modules.entities.service import EntityService
from app.modules.ranking.service import RankingService

router = APIRouter(tags=["ranking"])


@router.get("/rankings/movies")
async def top_movies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    genre: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    service = EntityService(db)
    items, total = await service.list_movies(page, page_size, genre_slug=genre, sort_by="score")
    return envelope(
        data=[i.model_dump() for i in items],
        meta=Meta(page=page, page_size=page_size, total=total),
    )


@router.post("/internal/rankings/recompute")
async def recompute_rankings(entity_type: str = "movie", db: AsyncSession = Depends(get_db)):
    """Internal-only endpoint to trigger a full ranking recompute (normally run by a scheduled job)."""
    service = RankingService(db)
    count = await service.recompute_all(entity_type)
    return envelope(data={"recomputed": count})
