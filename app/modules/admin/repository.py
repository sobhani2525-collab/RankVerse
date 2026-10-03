import uuid
from datetime import datetime, timezone

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.modules.admin.models import AdminAccount
from app.modules.entities.models import Entity
from app.modules.lists.models import UserList, UserListItem
from app.modules.users.models import User


class AdminAccountRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_email(self, email: str) -> AdminAccount | None:
        result = await self.db.execute(select(AdminAccount).where(AdminAccount.email == email))
        return result.scalar_one_or_none()

    async def get_by_id(self, admin_id: uuid.UUID) -> AdminAccount | None:
        return await self.db.get(AdminAccount, admin_id)

    async def mark_logged_in(self, admin: AdminAccount) -> None:
        admin.last_login_at = datetime.now(timezone.utc)
        await self.db.flush()

    async def update_password(self, admin: AdminAccount, password_hash: str) -> None:
        admin.password_hash = password_hash
        await self.db.flush()


class AdminListRepository:
    """Curation view over user_lists: the admin table, plus featured/hidden writes."""

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _item_count():
        return (
            select(func.count(UserListItem.id))
            .where(UserListItem.list_id == UserList.id)
            .correlate(UserList)
            .scalar_subquery()
        )

    async def search(
        self,
        *,
        q: str | None,
        featured: bool | None,
        hidden: bool | None,
        entity_type: str | None,
        min_items: int | None,
        sort: str,
        page: int,
        page_size: int,
    ) -> tuple[list[tuple[UserList, int]], int]:
        item_count = self._item_count().label("item_count")
        stmt = (
            select(UserList, item_count, func.count().over().label("total"))
            .where(UserList.is_watch_later.is_(False))
            .options(joinedload(UserList.owner))
        )
        if q:
            like = f"%{q.strip()}%"
            stmt = stmt.where(
                or_(
                    UserList.title.ilike(like),
                    UserList.owner.has(User.username.ilike(like)),
                )
            )
        if featured is not None:
            stmt = stmt.where(UserList.is_featured.is_(featured))
        if hidden is not None:
            stmt = stmt.where(UserList.is_hidden_from_discovery.is_(hidden))
        if entity_type:
            stmt = stmt.where(UserList.entity_type == entity_type)
        if min_items is not None:
            stmt = stmt.where(self._item_count() >= min_items)

        if sort == "popular":
            stmt = stmt.order_by(UserList.like_count.desc(), UserList.created_at.desc())
        elif sort == "items":
            stmt = stmt.order_by(item_count.desc(), UserList.created_at.desc())
        else:
            stmt = stmt.order_by(UserList.created_at.desc())

        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        rows = (await self.db.execute(stmt)).unique().all()
        total = rows[0].total if rows else 0
        return [(r.UserList, r.item_count) for r in rows], total

    async def get(self, list_id: uuid.UUID) -> UserList | None:
        stmt = select(UserList).where(UserList.id == list_id).options(joinedload(UserList.owner))
        return (await self.db.execute(stmt)).unique().scalar_one_or_none()

    async def item_count(self, list_id: uuid.UUID) -> int:
        return (
            await self.db.execute(
                select(func.count(UserListItem.id)).where(UserListItem.list_id == list_id)
            )
        ).scalar_one()

    async def max_featured_order(self) -> int:
        return (
            await self.db.execute(
                select(func.coalesce(func.max(UserList.featured_order), -1)).where(
                    UserList.is_featured.is_(True)
                )
            )
        ).scalar_one()

    async def featured(self) -> list[UserList]:
        stmt = (
            select(UserList)
            .where(UserList.is_featured.is_(True))
            .options(joinedload(UserList.owner))
            .order_by(UserList.featured_order.asc().nulls_last(), UserList.featured_at.desc().nulls_last())
        )
        return list((await self.db.execute(stmt)).unique().scalars().all())

    async def items(self, list_id: uuid.UUID) -> list[tuple[UserListItem, Entity, str | None]]:
        stmt = (
            select(UserListItem, Entity, User.username)
            .join(Entity, Entity.id == UserListItem.entity_id)
            .outerjoin(User, User.id == UserListItem.added_by_user_id)
            .where(UserListItem.list_id == list_id)
            .order_by(UserListItem.position)
        )
        return [(i, e, u) for i, e, u in (await self.db.execute(stmt)).all()]

    async def get_item(self, list_id: uuid.UUID, item_id: uuid.UUID) -> UserListItem | None:
        stmt = select(UserListItem).where(UserListItem.id == item_id, UserListItem.list_id == list_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()
