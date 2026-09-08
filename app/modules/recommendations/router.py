import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.entities.repository import EntityRepository
from app.modules.recommendations.schemas import RelatedEntityOut

router = APIRouter(prefix="/api/v1/entities", tags=["recommendations"])


@router.get("/{entity_id}/related")
async def get_related_entities(
    entity_id: uuid.UUID,
    limit: int = 6,
    db: AsyncSession = Depends(get_db),
):
    repo = EntityRepository(db)
    entity = await repo.get_by_id(entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    edges = await repo.get_related(entity_id, relation_type="similar_to", limit=limit)
    items = [
        RelatedEntityOut(
            id=str(edge.to_entity.id),
            title=edge.to_entity.title,
            slug=edge.to_entity.slug,
            weight=edge.weight,
            relation_type=edge.relation_type,
        )
        for edge in edges
    ]
    return {"data": [item.model_dump() for item in items], "meta": None, "error": None}
