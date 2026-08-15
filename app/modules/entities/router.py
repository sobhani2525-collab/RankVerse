from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import envelope, Meta
from app.modules.entities.service import EntityService

router = APIRouter(tags=["entities"])


@router.get("/movies")
async def list_movies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    genre: str | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
    sort: str = Query("score", pattern="^(score|newest)$"),
    db: AsyncSession = Depends(get_db),
):
    service = EntityService(db)
    items, total = await service.list_movies(page, page_size, genre, year_from, year_to, sort)
    return envelope(
        data=[i.model_dump() for i in items],
        meta=Meta(page=page, page_size=page_size, total=total),
    )


@router.get("/movies/{slug}")
async def get_movie(slug: str, db: AsyncSession = Depends(get_db)):
    service = EntityService(db)
    movie = await service.get_movie_detail(slug)
    return envelope(data=movie.model_dump())
