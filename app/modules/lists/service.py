import uuid

from slugify import slugify
from app.modules.lists.models import UserList
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, AlreadyExistsError, UnauthorizedError
from app.modules.entities.repository import EntityRepository
from app.modules.lists.repository import ListRepository
from app.modules.lists.schemas import (
    ListCreate, ListUpdate, ListItemCreate, ListSummary, ListDetail,
    ListItemPublic, EntityMini, CommentCreate, CommentPublic,
)


class ListService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = ListRepository(db)
        self.entity_repo = EntityRepository(db)

    async def _unique_slug(self, title: str) -> str:
        base = slugify(title)[:200]
        slug = base
        suffix = 1
        while await self.repo.slug_exists(slug):
            suffix += 1
            slug = f"{base}-{suffix}"
        return slug

    async def create_list(self, user_id: uuid.UUID, payload: ListCreate) -> UserList:
        slug = await self._unique_slug(payload.title)
        lst = await self.repo.create_list(
            user_id=user_id,
            title=payload.title,
            slug=slug,
            description=payload.description,
            entity_type=payload.entity_type,
            is_ranked=payload.is_ranked,
            visibility=payload.visibility,
            tags=payload.tags,
        )
        await self.db.commit()
        return lst

    async def get_list_detail(self, slug: str, current_user_id: uuid.UUID | None) -> ListDetail:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")

        if lst.visibility == "private" and (not current_user_id or current_user_id != lst.user_id):
            raise NotFoundError(f"List '{slug}' not found")

        await self.repo.increment_view(lst.id)
        await self.db.commit()

        is_liked = False
        is_following = False
        if current_user_id:
            is_liked = (await self.repo.get_like(lst.id, current_user_id)) is not None
            is_following = (await self.repo.get_follow(lst.id, current_user_id)) is not None

        items = [
            ListItemPublic(
                id=item.id,
                position=item.position,
                note=item.note,
                added_at=item.added_at,
                entity=EntityMini(
                    id=item.entity.id,
                    slug=item.entity.slug,
                    title=item.entity.title,
                    entity_type=item.entity.entity_type,
                    poster_path=item.entity.attributes.get("poster_path"),
                ),
            )
            for item in lst.items
        ]

        return ListDetail(
            id=lst.id,
            slug=lst.slug,
            title=lst.title,
            description=lst.description,
            entity_type=lst.entity_type,
            is_ranked=lst.is_ranked,
            visibility=lst.visibility,
            cover_image_url=lst.cover_image_url,
            tags=lst.tags,
            view_count=lst.view_count,
            like_count=lst.like_count,
            comment_count=lst.comment_count,
            follower_count=lst.follower_count,
            created_at=lst.created_at,
            items=items,
            is_liked=is_liked,
            is_following=is_following,
        )

    async def update_list(self, user_id: uuid.UUID, slug: str, payload: ListUpdate) -> UserList:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")
        if lst.user_id != user_id:
            raise UnauthorizedError("You don't have permission to edit this list")

        await self.repo.update_list(
            lst,
            title=payload.title,
            description=payload.description,
            visibility=payload.visibility,
            cover_image_url=payload.cover_image_url,
            tags=payload.tags,
        )
        await self.db.commit()
        return lst

    async def delete_list(self, user_id: uuid.UUID, slug: str) -> None:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")
        if lst.user_id != user_id:
            raise UnauthorizedError("You don't have permission to delete this list")

        await self.repo.delete_list(lst)
        await self.db.commit()

    async def list_user_lists(self, user_id: uuid.UUID) -> list[ListSummary]:
        lists = await self.repo.list_by_user(user_id)
        return [ListSummary.model_validate(lst) for lst in lists]

    async def discover(
        self, page: int, page_size: int, entity_type: str | None, tag: str | None, sort_by: str
    ) -> tuple[list[ListSummary], int]:
        lists, total = await self.repo.discover(page, page_size, entity_type, tag, sort_by)
        return [ListSummary.model_validate(lst) for lst in lists], total

    # --- Items ---

    async def add_item(self, user_id: uuid.UUID, slug: str, payload: ListItemCreate) -> ListItemPublic:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")
        if lst.user_id != user_id:
            raise UnauthorizedError("You don't have permission to edit this list")

        entity = await self.entity_repo.get_by_id(payload.entity_id)
        if not entity:
            raise NotFoundError("Entity not found")

        if await self.repo.item_exists(lst.id, entity.id):
            raise AlreadyExistsError("This item is already in the list")

        position = await self.repo.max_position(lst.id) + 1
        item = await self.repo.add_item(lst.id, entity.id, entity.entity_type, payload.note, position)
        await self.db.commit()

        return ListItemPublic(
            id=item.id,
            position=item.position,
            note=item.note,
            added_at=item.added_at,
            entity=EntityMini(
                id=entity.id, slug=entity.slug, title=entity.title,
                entity_type=entity.entity_type, poster_path=entity.attributes.get("poster_path"),
            ),
        )

    async def remove_item(self, user_id: uuid.UUID, slug: str, item_id: uuid.UUID) -> None:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")
        if lst.user_id != user_id:
            raise UnauthorizedError("You don't have permission to edit this list")

        item = await self.repo.get_item(lst.id, item_id)
        if not item:
            raise NotFoundError("Item not found in this list")

        await self.repo.remove_item(item)
        await self.db.commit()

    async def reorder_items(self, user_id: uuid.UUID, slug: str, item_ids: list[uuid.UUID]) -> None:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")
        if lst.user_id != user_id:
            raise UnauthorizedError("You don't have permission to edit this list")

        await self.repo.reorder_items(lst.id, item_ids)
        await self.db.commit()

    # --- Social: likes ---

    async def toggle_like(self, user_id: uuid.UUID, slug: str) -> bool:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")

        existing = await self.repo.get_like(lst.id, user_id)
        if existing:
            await self.repo.remove_like(existing)
            await self.db.commit()
            return False
        else:
            await self.repo.add_like(lst.id, user_id)
            await self.db.commit()
            return True

    # --- Social: follows ---

    async def toggle_follow(self, user_id: uuid.UUID, slug: str) -> bool:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")

        existing = await self.repo.get_follow(lst.id, user_id)
        if existing:
            await self.repo.remove_follow(existing)
            await self.db.commit()
            return False
        else:
            await self.repo.add_follow(lst.id, user_id)
            await self.db.commit()
            return True

    # --- Social: comments ---

    async def add_comment(self, user_id: uuid.UUID, slug: str, payload: CommentCreate) -> CommentPublic:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")

        comment = await self.repo.add_comment(lst.id, user_id, payload.body, payload.parent_comment_id)
        await self.db.commit()
        return CommentPublic.model_validate(comment)

    async def list_comments(self, slug: str) -> list[CommentPublic]:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")

        comments = await self.repo.list_comments(lst.id)
        return [CommentPublic.model_validate(c) for c in comments]