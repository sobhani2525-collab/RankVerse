import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import envelope, Meta
from app.modules.auth.dependencies import get_current_user, get_current_user_optional
from app.modules.users.models import User
from app.modules.lists.schemas import (
    ListCreate, ListUpdate, ListItemCreate, ListItemReorder, CommentCreate,
)
from app.modules.lists.service import ListService

router = APIRouter(tags=["lists"])


@router.post("/lists")
async def create_list(
    payload: ListCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ListService(db)
    lst = await service.create_list(current_user.id, payload)
    return envelope(data={"id": str(lst.id), "slug": lst.slug})


@router.get("/lists")
async def discover_lists(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    entity_type: str | None = None,
    tag: str | None = None,
    sort: str = Query("newest", pattern="^(newest|popular)$"),
    db: AsyncSession = Depends(get_db),
):
    service = ListService(db)
    items, total = await service.discover(page, page_size, entity_type, tag, sort)
    return envelope(
        data=[i.model_dump() for i in items],
        meta=Meta(page=page, page_size=page_size, total=total),
    )


@router.get("/lists/{slug}")
async def get_list(
    slug: str,
    current_user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    service = ListService(db)
    detail = await service.get_list_detail(slug, current_user.id if current_user else None)
    return envelope(data=detail.model_dump())


@router.put("/lists/{slug}")
async def update_list(
    slug: str,
    payload: ListUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ListService(db)
    lst = await service.update_list(current_user.id, slug, payload)
    return envelope(data={"id": str(lst.id), "slug": lst.slug})


@router.delete("/lists/{slug}")
async def delete_list(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ListService(db)
    await service.delete_list(current_user.id, slug)
    return envelope(data={"deleted": True})


@router.get("/users/me/lists")
async def my_lists(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ListService(db)
    lists = await service.list_user_lists(current_user.id)
    return envelope(data=[l.model_dump() for l in lists])


# --- Items ---

@router.post("/lists/{slug}/items")
async def add_item(
    slug: str,
    payload: ListItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ListService(db)
    item = await service.add_item(current_user.id, slug, payload)
    return envelope(data=item.model_dump())


@router.delete("/lists/{slug}/items/{item_id}")
async def remove_item(
    slug: str,
    item_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ListService(db)
    await service.remove_item(current_user.id, slug, item_id)
    return envelope(data={"deleted": True})


@router.put("/lists/{slug}/reorder")
async def reorder_items(
    slug: str,
    payload: ListItemReorder,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ListService(db)
    await service.reorder_items(current_user.id, slug, payload.item_ids)
    return envelope(data={"reordered": True})


# --- Social ---

@router.post("/lists/{slug}/like")
async def toggle_like(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ListService(db)
    liked = await service.toggle_like(current_user.id, slug)
    return envelope(data={"liked": liked})


@router.post("/lists/{slug}/follow")
async def toggle_follow(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ListService(db)
    following = await service.toggle_follow(current_user.id, slug)
    return envelope(data={"following": following})


@router.post("/lists/{slug}/comments")
async def add_comment(
    slug: str,
    payload: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ListService(db)
    comment = await service.add_comment(current_user.id, slug, payload)
    return envelope(data=comment.model_dump())


@router.get("/lists/{slug}/comments")
async def list_comments(slug: str, db: AsyncSession = Depends(get_db)):
    service = ListService(db)
    comments = await service.list_comments(slug)
    return envelope(data=[c.model_dump() for c in comments])