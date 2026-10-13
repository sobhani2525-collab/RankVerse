from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.cache import cached
from app.core.database import get_db, get_read_db
from app.core.schemas import envelope, Meta
from app.modules.entities.service import EntityService
from app.modules.ranking.service import RankingService
from app.modules.sync.dependencies import verify_internal_api_key

router = APIRouter(tags=["ranking"])


RANKING_EXCLUDED_MOVIE_GENRES = ("tv-movie",)


@router.get("/rankings/movies")
async def top_movies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    genre: str | None = None,
    year_from: int | None = Query(None, ge=1800, le=2100),
    year_to: int | None = Query(None, ge=1800, le=2100),
    sort: Literal["score", "votes", "year_desc", "year_asc"] = "score",
    origin: Literal["all", "persian", "foreign"] = "all",
    db: AsyncSession = Depends(get_read_db),
):
    async def load():
        # Made-for-TV films (stand-up specials, TV episodes released as "movies")
        # are fan-voted far above theatrical films; keep them out of the movie ranking.
        items, total = await EntityService(db).list_movies(
            page, page_size, genre_slug=genre, year_from=year_from, year_to=year_to, sort_by=sort, origin=origin,
            exclude_genre_slugs=RANKING_EXCLUDED_MOVIE_GENRES,
        )
        return envelope(
            data=[i.model_dump() for i in items],
            meta=Meta(page=page, page_size=page_size, total=total),
        )

    return await cached(
        ("rank-movies", page, page_size, genre, year_from, year_to, sort, origin), settings.cache_ttl_lists, load
    )


@router.get("/rankings/people")
async def top_people(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    role: Literal["all", "director", "actor", "creator"] = "all",
    sort: Literal["works", "score"] = "score",
    origin: Literal["all", "persian", "foreign"] = "all",
    db: AsyncSession = Depends(get_read_db),
):
    # list_people is itself cached (people TTL) inside EntityService.
    items, total = await EntityService(db).list_people(page, page_size, role=role, sort_by=sort, origin=origin)
    return envelope(
        data=[i.model_dump() for i in items],
        meta=Meta(page=page, page_size=page_size, total=total),
    )


@router.get("/movies/{slug}/rankings")
async def movie_ranking_highlights(slug: str, db: AsyncSession = Depends(get_read_db)):
    """Where this movie ranks within each automatic ranking group it belongs to (genre, director, ...)."""
    async def load():
        entity = await EntityService(db).get_movie_entity(slug)
        highlights = await RankingService(db).get_entity_highlights(entity)
        return envelope(data=[h.model_dump() for h in highlights])

    return await cached(("highlights", "movie", slug), settings.cache_ttl_lists, load)


@router.get("/rankings/tv-series")
async def top_tv_series(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    genre: str | None = None,
    year_from: int | None = Query(None, ge=1800, le=2100),
    year_to: int | None = Query(None, ge=1800, le=2100),
    sort: Literal["score", "votes", "year_desc", "year_asc"] = "score",
    origin: Literal["all", "persian", "foreign"] = "all",
    db: AsyncSession = Depends(get_read_db),
):
    async def load():
        items, total = await EntityService(db).list_tv_series(
            page, page_size, genre_slug=genre, year_from=year_from, year_to=year_to, sort_by=sort, origin=origin
        )
        return envelope(
            data=[i.model_dump() for i in items],
            meta=Meta(page=page, page_size=page_size, total=total),
        )

    return await cached(
        ("rank-tv", page, page_size, genre, year_from, year_to, sort, origin), settings.cache_ttl_lists, load
    )


@router.get("/tv-series/{slug}/rankings")
async def tv_series_ranking_highlights(slug: str, db: AsyncSession = Depends(get_read_db)):
    """Where this tv_series ranks within each automatic ranking group it belongs to (genre, creator, ...)."""
    async def load():
        entity = await EntityService(db).get_tv_series_entity(slug)
        highlights = await RankingService(db).get_entity_highlights(entity)
        return envelope(data=[h.model_dump() for h in highlights])

    return await cached(("highlights", "tv_series", slug), settings.cache_ttl_lists, load)


@router.post("/internal/rankings/recompute", dependencies=[Depends(verify_internal_api_key)])
async def recompute_rankings(entity_type: str = "movie", db: AsyncSession = Depends(get_db)):
    """Internal-only endpoint to trigger a full ranking recompute (normally run by a scheduled job)."""
    service = RankingService(db)
    count = await service.recompute_all(entity_type)
    return envelope(data={"recomputed": count})
