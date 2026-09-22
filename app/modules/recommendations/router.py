import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.modules.entities.repository import EntityRepository
from app.modules.recommendations.schemas import RelatedEntityOut

router = APIRouter(prefix="/entities", tags=["recommendations"])


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
                entity_type=edge.to_entity.entity_type,
                weight=edge.weight,
                relation_type=edge.relation_type,
                poster_path=edge.to_entity.attributes.get("poster_path"),
                reason=reason,
            )
        )

    # Fallback: the similar_to graph (scripts/build_similarity_graph.py)
    # only links entities with >=2 shared connections, so a title with
    # sparse director/cast data -- common for smaller/regional titles in
    # this catalog -- can clear zero or few of them, leaving this section
    # empty far more often than it should be. Top up with same-genre,
    # same-type entities ranked by score so the section (almost) always
    # has something to show, without ever duplicating a similar_to pick.
    if len(items) < limit:
        already_ids = [edge.to_entity.id for edge in edges]
        fallback_entities = await repo.find_similar_by_genre(
            entity_id, entity.entity_type, exclude_ids=[entity_id, *already_ids], limit=limit - len(items)
        )
        for fallback_entity in fallback_entities:
            shared = await repo.get_shared_connections(entity_id, fallback_entity.id)
            items.append(
                RelatedEntityOut(
                    id=str(fallback_entity.id),
                    title=fallback_entity.title,
                    slug=fallback_entity.slug,
                    entity_type=fallback_entity.entity_type,
                    # Lower than a real similar_to weight (max ~0.6, see
                    # build_similarity_graph.py) so these visibly read as a
                    # softer match than a genuine similar_to pick.
                    weight=0.35,
                    relation_type="same_genre",
                    poster_path=fallback_entity.attributes.get("poster_path"),
                    reason=build_reason(shared),
                )
            )

    return {"data": [item.model_dump() for item in items], "meta": None, "error": None}
