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
    type: str | None = Query(None, alias="type"),
    limit: int = Query(20, le=50),
    db: AsyncSession = Depends(get_db),
):
    """
    MVP search: simple ILIKE on entity title.
    Post-MVP: replace with Postgres full-text search (tsvector) or a dedicated
    search engine once catalog size and query volume justify it.

    type is optional and scopes the search to one entity_type (e.g. adding
    an item to a movie-only list) -- omitting it searches across every
    entity_type, which is what the global site search box does.
    """
    stmt = select(Entity).where(Entity.title.ilike(f"%{q}%"))
    if type:
        stmt = stmt.where(Entity.entity_type == type)
    stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    entities = result.scalars().all()

    return envelope(
        data=[
            {"id": str(e.id), "slug": e.slug, "title": e.title, "type": e.entity_type}
            for e in entities
        ]
    )
