"""Admin: browse, edit and delete entities of every type (movie, series,
person, genre, ...). Complements entities_router (Persian overviews/trailers
for titles, and manual create)."""
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import NotFoundError, ValidationError
from app.core.schemas import Meta, envelope
from app.modules.admin.audit import AuditLogService
from app.modules.admin.dependencies import get_current_admin
from app.modules.admin.models import AdminAccount
from app.modules.entities.detail_cache import invalidate_title_detail
from app.modules.entities.models import Entity, RelationshipEdge
from app.modules.sync.translation import is_persian

router = APIRouter(prefix="/admin/entity-manager", tags=["admin-entity-manager"])


def _year_key(entity_type: str) -> str:
    return "birth_year" if entity_type == "person" else "year"


def _text_key(entity_type: str) -> str:
    return "biography" if entity_type == "person" else "overview"


def _summary(e: Entity) -> dict:
    a = e.attributes or {}
    y = a.get(_year_key(e.entity_type))
    return {
        "id": str(e.id),
        "entity_type": e.entity_type,
        "title": e.title,
        "title_fa": a.get("title_fa"),
        "slug": e.slug,
        "year": y if isinstance(y, int) else None,
        "external_source": e.external_source,
        "image_url": (a.get("media") or {}).get("image_url"),
    }


async def _relation_count(db: AsyncSession, entity_id: uuid.UUID) -> int:
    return (await db.execute(
        select(func.count()).select_from(RelationshipEdge).where(
            or_(RelationshipEdge.from_entity_id == entity_id, RelationshipEdge.to_entity_id == entity_id)
        )
    )).scalar_one()


async def _get(db: AsyncSession, entity_id: uuid.UUID) -> Entity:
    entity = await db.get(Entity, entity_id)
    if entity is None:
        raise NotFoundError("Entity not found")
    return entity


def _put(d: dict, key: str, value) -> None:
    """Sets d[key], or removes it when value is empty."""
    if value:
        d[key] = value
    else:
        d.pop(key, None)


class EntityPatch(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=500)
    title_fa: str | None = Field(None, max_length=500)   # "" clears
    year: int | None = Field(None, ge=0, le=2100)         # 0 clears
    text: str | None = Field(None, max_length=5000)       # overview / biography, "" clears
    image_url: str | None = Field(None, max_length=1000)  # "" clears


@router.get("/types")
async def entity_types(_a: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Entity.entity_type, func.count()).group_by(Entity.entity_type).order_by(func.count().desc())
    )).all()
    return envelope(data=[{"entity_type": t, "count": c} for t, c in rows])


@router.get("")
async def list_entities(
    q: str | None = Query(None, max_length=200),
    entity_type: str | None = Query(None, max_length=50),
    source: Literal["manual", "imported"] | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
    _a: AdminAccount = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    cond = []
    if entity_type:
        cond.append(Entity.entity_type == entity_type)
    if source == "manual":
        cond.append(Entity.external_source == "manual")
    elif source == "imported":
        cond.append(or_(Entity.external_source.is_(None), Entity.external_source != "manual"))
    if q:
        pat = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        cond.append(or_(
            Entity.title.ilike(pat, escape="\\"),
            Entity.slug.ilike(pat, escape="\\"),
            Entity.attributes["title_fa"].astext.ilike(pat, escape="\\"),
        ))
    total = (await db.execute(select(func.count()).select_from(Entity).where(*cond))).scalar_one()
    order = (Entity.created_at.desc(),) if source == "manual" else (Entity.title,)
    rows = (await db.execute(
        select(Entity).where(*cond).order_by(*order).offset((page - 1) * page_size).limit(page_size)
    )).scalars().all()
    return envelope(data=[_summary(e) for e in rows], meta=Meta(page=page, page_size=page_size, total=total))


@router.get("/{entity_id}")
async def entity_detail(
    entity_id: uuid.UUID, _a: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db)
):
    e = await _get(db, entity_id)
    a = e.attributes or {}
    return envelope(data={
        **_summary(e),
        "text": a.get(_text_key(e.entity_type)),
        "text_source": a.get(f"{_text_key(e.entity_type)}_source"),
        "external_id": e.external_id,
        "relation_count": await _relation_count(db, e.id),
        "attributes": a,
    })


@router.patch("/{entity_id}")
async def update_entity(
    entity_id: uuid.UUID, payload: EntityPatch, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    e = await _get(db, entity_id)
    attrs = dict(e.attributes or {})
    before = {"title": e.title, "attributes": dict(attrs)}
    data = payload.model_dump(exclude_unset=True)

    if data.get("title") is not None:
        if not data["title"].strip():
            raise ValidationError("Title is required")
        e.title = data["title"].strip()
    if "title_fa" in data:
        v = (data["title_fa"] or "").strip()
        if v and not is_persian(v):
            raise ValidationError("Persian title must be written in Persian")
        _put(attrs, "title_fa", v)
    if "year" in data:
        _put(attrs, _year_key(e.entity_type), data["year"])
    if "text" in data:
        v = (data["text"] or "").strip()
        key = _text_key(e.entity_type)
        if v and not is_persian(v):
            raise ValidationError("Text must be written in Persian")
        _put(attrs, key, v)
        _put(attrs, f"{key}_source", "manual" if v else None)
        attrs.pop("overview_translation_v", None)
    if "image_url" in data:
        v = (data["image_url"] or "").strip()
        if v and not v.lower().startswith("https://"):
            raise ValidationError("Image URL must start with https://")
        media = dict(attrs.get("media") or {})
        _put(media, "image_url", v)
        attrs["media"] = media

    e.attributes = attrs
    await AuditLogService(db).record(
        admin, "entity.update", "entity", e.id,
        before=before, after={"title": e.title, "attributes": attrs}, request=request,
    )
    await db.commit()
    invalidate_title_detail(e.entity_type, e.slug)
    return envelope(data=_summary(e))


@router.delete("/{entity_id}")
async def delete_entity(
    entity_id: uuid.UUID, request: Request,
    admin: AdminAccount = Depends(get_current_admin), db: AsyncSession = Depends(get_db),
):
    """Hard delete. Relations, rankings, votes, list items, battles and watch
    links referencing it go with it (ON DELETE CASCADE)."""
    e = await _get(db, entity_id)
    relations = await _relation_count(db, e.id)
    await AuditLogService(db).record(
        admin, "entity.delete", "entity", e.id,
        before={"entity_type": e.entity_type, "title": e.title, "slug": e.slug,
                "external_source": e.external_source, "external_id": e.external_id, "relations": relations},
        after=None, request=request,
    )
    entity_type, slug = e.entity_type, e.slug
    await db.delete(e)
    await db.commit()
    invalidate_title_detail(entity_type, slug)
    return envelope(data={"deleted": True, "relations_removed": relations})
