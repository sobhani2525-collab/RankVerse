"""Admin: view, add and remove relationship edges between entities.

Edge direction follows the sync: the title is the source, e.g.
movie --directed_by--> person, movie --acted_in--> person (character in
edge_metadata), movie --has_genre--> genre."""
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.database import get_db
from app.core.exceptions import NotFoundError, ValidationError
from app.core.schemas import Meta, envelope
from app.modules.admin.audit import AuditLogService
from app.modules.admin.dependencies import get_current_admin
from app.modules.admin.models import AdminAccount
from app.modules.entities.detail_cache import invalidate_title_detail
from app.modules.entities.models import Entity, RelationshipEdge

router = APIRouter(prefix="/admin/relations", tags=["admin-relations"])

RelationType = Literal["directed_by", "acted_in", "creator", "has_genre"]
# relation_type -> (allowed source types, allowed target types)
ALLOWED = {
    "directed_by": (("movie", "tv_series"), ("person",)),
    "acted_in": (("movie", "tv_series"), ("person",)),
    "creator": (("tv_series",), ("person",)),
    "has_genre": (("movie", "tv_series"), ("genre",)),
}


class RelationCreate(BaseModel):
    from_entity_id: uuid.UUID  # the movie / series
    to_entity_id: uuid.UUID    # the person / genre
    relation_type: RelationType
    character: str | None = Field(None, max_length=200)  # acted_in only


def _ent(e: Entity) -> dict:
    a = e.attributes or {}
    return {"id": str(e.id), "entity_type": e.entity_type, "title": e.title, "title_fa": a.get("title_fa"), "slug": e.slug}


def _row(edge: RelationshipEdge, src: Entity, dst: Entity) -> dict:
    return {
        "id": str(edge.id),
        "relation_type": edge.relation_type,
        "source": edge.source,
        "metadata": edge.edge_metadata or {},
        "from": _ent(src),
        "to": _ent(dst),
    }


@router.get("")
async def list_relations(
    entity_id: uuid.UUID | None = None,
    relation_type: str | None = Query(None, max_length=50),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    _a: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Edges touching entity_id (either side), or all edges of a type."""
    if entity_id is None and not relation_type:
        raise ValidationError("Pass entity_id or relation_type")
    src, dst = aliased(Entity), aliased(Entity)
    cond = []
    if entity_id:
        cond.append(or_(RelationshipEdge.from_entity_id == entity_id, RelationshipEdge.to_entity_id == entity_id))
    if relation_type:
        cond.append(RelationshipEdge.relation_type == relation_type)
    total = (await db.execute(select(func.count()).select_from(RelationshipEdge).where(*cond))).scalar_one()
    rows = (await db.execute(
        select(RelationshipEdge, src, dst)
        .join(src, src.id == RelationshipEdge.from_entity_id)
        .join(dst, dst.id == RelationshipEdge.to_entity_id)
        .where(*cond)
        .order_by(RelationshipEdge.relation_type, RelationshipEdge.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size)
    )).all()
    return envelope(data=[_row(e, s, d) for e, s, d in rows], meta=Meta(page=page, page_size=page_size, total=total))


@router.post("", status_code=201)
async def create_relation(
    payload: RelationCreate, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    src = await db.get(Entity, payload.from_entity_id)
    dst = await db.get(Entity, payload.to_entity_id)
    if src is None or dst is None:
        raise NotFoundError("Entity not found")
    allowed_src, allowed_dst = ALLOWED[payload.relation_type]
    if src.entity_type not in allowed_src or dst.entity_type not in allowed_dst:
        raise ValidationError(
            f"{payload.relation_type} must go from {'/'.join(allowed_src)} to {'/'.join(allowed_dst)}"
        )
    meta = {}
    if payload.relation_type == "acted_in" and payload.character and payload.character.strip():
        meta["character"] = payload.character.strip()
    edge = RelationshipEdge(
        from_entity_id=src.id, to_entity_id=dst.id, relation_type=payload.relation_type,
        edge_metadata=meta, source="manual",
    )
    db.add(edge)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise ValidationError("This relation already exists")
    await AuditLogService(db).record(
        admin, "relation.create", "relationship", edge.id, before=None,
        after={"from": src.title, "to": dst.title, "relation_type": payload.relation_type}, request=request,
    )
    await db.commit()
    invalidate_title_detail(src.entity_type, src.slug)
    return envelope(data=_row(edge, src, dst))


@router.delete("/{relation_id}")
async def delete_relation(
    relation_id: uuid.UUID, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    edge = await db.get(RelationshipEdge, relation_id)
    if edge is None:
        raise NotFoundError("Relation not found")
    src = await db.get(Entity, edge.from_entity_id)
    dst = await db.get(Entity, edge.to_entity_id)
    await AuditLogService(db).record(
        admin, "relation.delete", "relationship", edge.id,
        before={"from": src.title if src else None, "to": dst.title if dst else None,
                "relation_type": edge.relation_type, "source": edge.source},
        after=None, request=request,
    )
    await db.delete(edge)
    await db.commit()
    if src:
        invalidate_title_detail(src.entity_type, src.slug)
    return envelope(data={"deleted": True})
