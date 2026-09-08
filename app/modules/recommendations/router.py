import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.entities.repository import EntityRepository
from app.modules.recommendations.schemas import RelatedEntityOut

router = APIRouter(prefix="/api/v1/entities", tags=["recommendations"])


def build_reason(shared: list) -> str:
    directors = [t for rel_type, t in shared if rel_type == "directed_by"]
    actors = [t for rel_type, t in shared if rel_type == "acted_in"]
    genres = [t for rel_type, t in shared if rel_type == "has_genre"]

    parts = []
    if directors:
        parts.append(f"هر دو را {directors[0]} کارگردانی کرده")
    if actors:
        names = " و ".join(actors[:2])
        parts.append(f"{names} در هر دو بازی کرده")
    if genres:
        names = "، ".join(genres[:3])
        parts.append(f"ژانر مشترک: {names}")

    if not parts:
        return "بر اساس شباهت کلی در گراف دانش"
    return " • ".join(parts)


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

    items = []
    for edge in edges:
        shared = await repo.get_shared_connections(entity_id, edge.to_entity.id)
        reason = build_reason(shared)
        items.append(
            RelatedEntityOut(
                id=str(edge.to_entity.id),
                title=edge.to_entity.title,
                slug=edge.to_entity.slug,
                weight=edge.weight,
                relation_type=edge.relation_type,
                poster_path=edge.to_entity.attributes.get("poster_path"),
                reason=reason,
            )
        )

    return {"data": [item.model_dump() for item in items], "meta": None, "error": None}
