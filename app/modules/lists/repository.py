import uuid

from sqlalchemy import select, func, update, delete
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.lists.models import (
    UserList, UserListItem, ListLike, ListFollow, ListComment
)


class ListRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # --- Lists ---

    async def create_list(self, **kwargs) -> UserList:
        lst = UserList(**kwargs)
        self.db.add(lst)
        await self.db.flush()
        return lst

    async def get_by_slug(self, slug: str) -> UserList | None:
        stmt = (
            select(UserList)
            .options(selectinload(UserList.items).selectinload(UserListItem.entity))
            .where(UserList.slug == slug)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id(self, list_id: uuid.UUID) -> UserList | None:
        return await self.db.get(UserList, list_id)

    async def slug_exists(self, slug: str) -> bool:
        stmt = select(func.count()).select_from(UserList).where(UserList.slug == slug)
        return (await self.db.execute(stmt)).scalar_one() > 0

    async def update_list(self, lst: UserList, **kwargs) -> UserList:
        for key, value in kwargs.items():
            if value is not None:
                setattr(lst, key, value)
        await self.db.flush()
        return lst

    async def delete_list(self, lst: UserList) -> None:
        await self.db.delete(lst)

    async def list_by_user(self, user_id: uuid.UUID) -> list[UserList]:
        stmt = (
            select(UserList)
            .where(UserList.user_id == user_id)
            .order_by(UserList.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def discover(
        self,
        page: int = 1,
        page_size: int = 20,
        entity_type: str | None = None,
        tag: str | None = None,
        sort_by: str = "newest",
    ) -> tuple[list[UserList], int]:
        stmt = select(UserList).where(UserList.visibility == "public")

        if entity_type:
            stmt = stmt.where(UserList.entity_type == entity_type)
        if tag:
            stmt = stmt.where(UserList.tags.contains([tag]))

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.db.execute(count_stmt)).scalar_one()

        if sort_by == "popular":
            stmt = stmt.order_by(UserList.like_count.desc())
        else:
            stmt = stmt.order_by(UserList.created_at.desc())

        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    # --- Items ---

    async def add_item(self, list_id: uuid.UUID, entity_id: uuid.UUID, entity_type: str, note: str | None, position: int) -> UserListItem:
        item = UserListItem(
            list_id=list_id,
            entity_id=entity_id,
            entity_type=entity_type,
            note=note,
            position=position,
        )
        self.db.add(item)
        await self.db.flush()
        return item

    async def get_item(self, list_id: uuid.UUID, item_id: uuid.UUID) -> UserListItem | None:
        stmt = select(UserListItem).where(
            UserListItem.id == item_id, UserListItem.list_id == list_id
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def item_exists(self, list_id: uuid.UUID, entity_id: uuid.UUID) -> bool:
        stmt = select(func.count()).select_from(UserListItem).where(
            UserListItem.list_id == list_id, UserListItem.entity_id == entity_id
        )
        return (await self.db.execute(stmt)).scalar_one() > 0

    async def max_position(self, list_id: uuid.UUID) -> int:
        stmt = select(func.max(UserListItem.position)).where(UserListItem.list_id == list_id)
        result = (await self.db.execute(stmt)).scalar_one_or_none()
        return result or 0

    async def remove_item(self, item: UserListItem) -> None:
        await self.db.delete(item)

    async def reorder_items(self, list_id: uuid.UUID, item_ids: list[uuid.UUID]) -> None:
        for position, item_id in enumerate(item_ids):
            stmt = (
                update(UserListItem)
                .where(UserListItem.id == item_id, UserListItem.list_id == list_id)
                .values(position=position)
            )
            await self.db.execute(stmt)

    # --- Likes ---

    async def get_like(self, list_id: uuid.UUID, user_id: uuid.UUID) -> ListLike | None:
        stmt = select(ListLike).where(ListLike.list_id == list_id, ListLike.user_id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def add_like(self, list_id: uuid.UUID, user_id: uuid.UUID) -> ListLike:
        like = ListLike(list_id=list_id, user_id=user_id)
        self.db.add(like)
        await self.db.execute(
            update(UserList).where(UserList.id == list_id).values(like_count=UserList.like_count + 1)
        )
        await self.db.flush()
        return like

    async def remove_like(self, like: ListLike) -> None:
        await self.db.delete(like)
        await self.db.execute(
            update(UserList).where(UserList.id == like.list_id).values(like_count=UserList.like_count - 1)
        )

    # --- Follows ---

    async def get_follow(self, list_id: uuid.UUID, user_id: uuid.UUID) -> ListFollow | None:
        stmt = select(ListFollow).where(ListFollow.list_id == list_id, ListFollow.user_id == user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def add_follow(self, list_id: uuid.UUID, user_id: uuid.UUID) -> ListFollow:
        follow = ListFollow(list_id=list_id, user_id=user_id)
        self.db.add(follow)
        await self.db.execute(
            update(UserList).where(UserList.id == list_id).values(follower_count=UserList.follower_count + 1)
        )
        await self.db.flush()
        return follow

    async def remove_follow(self, follow: ListFollow) -> None:
        await self.db.delete(follow)
        await self.db.execute(
            update(UserList).where(UserList.id == follow.list_id).values(follower_count=UserList.follower_count - 1)
        )

    # --- Comments ---

    async def add_comment(self, list_id: uuid.UUID, user_id: uuid.UUID, body: str, parent_comment_id: uuid.UUID | None) -> ListComment:
        comment = ListComment(
            list_id=list_id, user_id=user_id, body=body, parent_comment_id=parent_comment_id
        )
        self.db.add(comment)
        await self.db.execute(
            update(UserList).where(UserList.id == list_id).values(comment_count=UserList.comment_count + 1)
        )
        await self.db.flush()
        return comment

    async def list_comments(self, list_id: uuid.UUID) -> list[ListComment]:
        stmt = (
            select(ListComment)
            .where(ListComment.list_id == list_id)
            .order_by(ListComment.created_at.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def increment_view(self, list_id: uuid.UUID) -> None:
        await self.db.execute(
            update(UserList).where(UserList.id == list_id).values(view_count=UserList.view_count + 1)
        )