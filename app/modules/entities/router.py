from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import envelope, Meta
from app.modules.auth.dependencies import get_current_user_optional
from app.modules.battles.schemas import SuggestedBattleResponse, SuggestedBattleEntity
from app.modules.battles.suggested import SuggestedBattleService
from app.modules.entities.service import EntityService
from app.modules.users.models import User

router = APIRouter(tags=["entities"])


async def _suggested_battle_response(
    db: AsyncSession, current_user: User | None, slug: str, entity_type: str
):
    service = SuggestedBattleService(db)
    pair = await service.get_suggested_battle_for_slug(
        current_user.id if current_user else None, slug, entity_type
    )
    if pair is None:
        return envelope(data=None)
    return envelope(
        data=SuggestedBattleResponse(
            category=entity_type,
            left=SuggestedBattleEntity(**pair.left),
            right=SuggestedBattleEntity(**pair.right),
        ).model_dump()
    )


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


@router.get("/movies/{slug}/suggested-battle")
async def get_movie_suggested_battle(
    slug: str,
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    Only meaningful for a logged-in user with a taste anchor (see
    SuggestedBattleService) -- data is null for a guest or an anchor-less
    user, and the frontend hides the card entirely rather than erroring.
    """
    return await _suggested_battle_response(db, current_user, slug, "movie")


@router.get("/tv-series/{slug}")
async def get_tv_series(slug: str, db: AsyncSession = Depends(get_db)):
    service = EntityService(db)
    tv_series = await service.get_tv_series_detail(slug)
    return envelope(data=tv_series.model_dump())


@router.get("/tv-series/{slug}/suggested-battle")
async def get_tv_series_suggested_battle(
    slug: str,
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    return await _suggested_battle_response(db, current_user, slug, "tv_series")


@router.get("/people/{slug}")
async def get_person(slug: str, db: AsyncSession = Depends(get_db)):
    service = EntityService(db)
    person = await service.get_person_detail(slug)
    return envelope(data=person.model_dump())


@router.get("/genres/{slug}")
async def get_genre(slug: str, db: AsyncSession = Depends(get_db)):
    service = EntityService(db)
    genre = await service.get_genre_detail(slug)
    return envelope(data=genre.model_dump())


@router.get("/tracks/{slug}")
async def get_track(slug: str, db: AsyncSession = Depends(get_db)):
    service = EntityService(db)
    track = await service.get_track_detail(slug)
    return envelope(data=track.model_dump())