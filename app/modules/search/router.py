from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import envelope
from app.modules.entities.models import Entity

router = APIRouter(tags=["search"])


@router.get("/search")
async def search(
    q: str = Query(min_length=1),
    type: str = Query("movie", alias="type"),
    limit: int = Query(20, le=50),
    db: AsyncSession = Depends(get_db),
):
    """
    MVP search: simple ILIKE on entity title.
    Post-MVP: replace with Postgres full-text search (tsvector) or a dedicated
    search engine once catalog size and query volume justify it.
    """
    stmt = (
        select(Entity)
        .where(Entity.entity_type == type, Entity.title.ilike(f"%{q}%"))
        .limit(limit)
    )
    result = await db.execute(stmt)
    entities = result.scalars().all()

    return envelope(
        data=[
            {"id": str(e.id), "slug": e.slug, "title": e.title, "type": e.entity_type}
            for e in entities
        ]
    )
