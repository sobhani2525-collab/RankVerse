import uuid
from datetime import datetime, timedelta

from sqlalchemy import Select, func, literal, or_, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.models import AdminAccount
from app.modules.battles.models import PairVote
from app.modules.daily_battle.models import DailyBattleVote
from app.modules.entities.models import Entity, EntityComment
from app.modules.lists.models import ListComment, UserList
from app.modules.users.models import User, UserFavorite, UserRating

SORTS = ("created_at", "last_login_at", "email", "username", "ratings_count", "lists_count")


def user_status(user: User) -> str:
    if user.deleted_at is not None:
        return "deleted"
    return "active" if user.is_active else "blocked"


def _like_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class AdminUserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, user_id: uuid.UUID) -> User | None:
        return await self.db.get(User, user_id)

    # --- list -----------------------------------------------------------

    @staticmethod
    def _count_subquery(model, user_col, *extra):
        return (
            select(func.count()).select_from(model)
            .where(user_col == User.id, *extra).correlate(User).scalar_subquery()
        )

    def _filters(
        self, stmt: Select, *, q=None, status=None, email_verified=None, created_from=None, created_to=None,
        last_login_from=None, last_login_to=None, never_logged_in=None, ids=None,
    ) -> Select:
        if ids is not None:
            stmt = stmt.where(User.id.in_(ids))
        if q and q.strip():
            term = q.strip()
            like = f"%{_like_escape(term.lower())}%"
            conds = [
                func.lower(User.email).like(like, escape="\\"),
                func.lower(User.username).like(like, escape="\\"),
                func.lower(func.coalesce(User.display_name, "")).like(like, escape="\\"),
            ]
            try:
                conds.append(User.id == uuid.UUID(term))
            except ValueError:
                pass
            stmt = stmt.where(or_(*conds))

        # Status is derived: deleted wins over blocked wins over active.
        if status == "active":
            stmt = stmt.where(User.deleted_at.is_(None), User.is_active.is_(True))
        elif status == "blocked":
            stmt = stmt.where(User.deleted_at.is_(None), User.is_active.is_(False))
        elif status == "deleted":
            stmt = stmt.where(User.deleted_at.is_not(None))
        elif status != "all":
            stmt = stmt.where(User.deleted_at.is_(None))

        if email_verified is True:
            stmt = stmt.where(User.email_verified_at.is_not(None))
        elif email_verified is False:
            stmt = stmt.where(User.email_verified_at.is_(None))
        if created_from:
            stmt = stmt.where(User.created_at >= created_from)
        if created_to:
            stmt = stmt.where(User.created_at <= created_to)
        if last_login_from:
            stmt = stmt.where(User.last_login_at >= last_login_from)
        if last_login_to:
            stmt = stmt.where(User.last_login_at <= last_login_to)
        if never_logged_in is True:
            stmt = stmt.where(User.last_login_at.is_(None))
        elif never_logged_in is False:
            stmt = stmt.where(User.last_login_at.is_not(None))
        return stmt

    async def search(self, *, sort: str, order: str, page: int, page_size: int, **filters) -> tuple[list[User], int]:
        stmt = self._filters(select(User, func.count().over().label("total")), **filters)

        if sort == "ratings_count":
            key = self._count_subquery(UserRating, UserRating.user_id)
        elif sort == "lists_count":
            key = self._count_subquery(UserList, UserList.user_id, UserList.is_watch_later.is_(False))
        else:
            key = getattr(User, sort if sort in SORTS else "created_at")
        key = key.asc() if order == "asc" else key.desc()
        if sort == "last_login_at":
            key = key.nulls_last()
        stmt = stmt.order_by(key, User.id).offset((page - 1) * page_size).limit(page_size)

        rows = (await self.db.execute(stmt)).all()
        return [r.User for r in rows], (rows[0].total if rows else 0)

    async def get_many(self, ids: list[uuid.UUID]) -> list[User]:
        if not ids:
            return []
        return list((await self.db.execute(select(User).where(User.id.in_(ids)))).scalars().all())

    async def ids_matching(self, filters: dict, limit: int) -> list[uuid.UUID]:
        stmt = self._filters(select(User.id), **filters).order_by(User.created_at.desc(), User.id).limit(limit)
        return list((await self.db.execute(stmt)).scalars().all())

    async def count_matching(self, **filters) -> int:
        stmt = self._filters(select(func.count()).select_from(User), **filters)
        return (await self.db.execute(stmt)).scalar_one()

    async def counts_for(self, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict[str, int]]:
        """ratings/lists/comments per user for one page: grouped queries, not N+1."""
        out = {uid: {"ratings": 0, "lists": 0, "comments": 0} for uid in user_ids}
        if not user_ids:
            return out

        async def grouped(col, *where):
            res = await self.db.execute(select(col, func.count()).where(col.in_(user_ids), *where).group_by(col))
            return res.all()

        for uid, n in await grouped(UserRating.user_id):
            out[uid]["ratings"] = n
        for uid, n in await grouped(UserList.user_id, UserList.is_watch_later.is_(False)):
            out[uid]["lists"] = n
        for col in (ListComment.user_id, EntityComment.user_id):
            for uid, n in await grouped(col):
                out[uid]["comments"] += n
        return out

    async def detail_counts(self, user_id: uuid.UUID) -> dict[str, int]:
        counts = (await self.counts_for([user_id]))[user_id]

        async def count(model, col) -> int:
            return (await self.db.execute(select(func.count()).select_from(model).where(col == user_id))).scalar_one()

        counts["favorites"] = await count(UserFavorite, UserFavorite.user_id)
        counts["battle_votes"] = await count(PairVote, PairVote.user_id) + await count(
            DailyBattleVote, DailyBattleVote.user_id
        )
        return counts

    async def admin_email(self, admin_id: uuid.UUID | None) -> str | None:
        if admin_id is None:
            return None
        stmt = select(AdminAccount.email).where(AdminAccount.id == admin_id)
        return (await self.db.execute(stmt)).scalar_one_or_none()

    # --- stats ----------------------------------------------------------

    async def stats(self, now: datetime, day_start: datetime) -> dict[str, int]:
        live = User.deleted_at.is_(None)
        d7, d14, d30, d60 = (now - timedelta(days=n) for n in (7, 14, 30, 60))
        row = (
            await self.db.execute(
                select(
                    func.count().filter(live).label("total"),
                    func.count().filter(live, User.created_at >= d7).label("new_7d"),
                    func.count().filter(live, User.created_at >= d14, User.created_at < d7).label("prev_7d"),
                    func.count().filter(live, User.created_at >= d30).label("new_30d"),
                    func.count().filter(live, User.created_at >= d60, User.created_at < d30).label("prev_30d"),
                    func.count().filter(live, User.last_login_at >= day_start).label("active_today"),
                    func.count().filter(live, User.is_active.is_(False)).label("blocked"),
                    func.count().filter(live, User.email_verified_at.is_(None)).label("unverified"),
                    func.count().filter(User.deleted_at.is_not(None)).label("deleted"),
                ).select_from(User)
            )
        ).one()
        return dict(row._mapping)

    # --- uniqueness -----------------------------------------------------

    async def taken(self, column, value: str, exclude_id: uuid.UUID) -> bool:
        stmt = select(User.id).where(func.lower(column) == value.lower(), User.id != exclude_id).limit(1)
        return (await self.db.execute(stmt)).first() is not None

    # --- activity -------------------------------------------------------

    async def activity(self, user_id: uuid.UUID, kind: str, page: int, page_size: int) -> tuple[list[dict], int]:
        offset, limit = (page - 1) * page_size, page_size

        if kind == "comments":
            list_comments = (
                select(
                    ListComment.id.label("id"), literal("list").label("target_kind"),
                    UserList.title.label("target_title"), UserList.slug.label("target_slug"),
                    ListComment.body.label("body"), ListComment.created_at.label("created_at"),
                )
                .join(UserList, UserList.id == ListComment.list_id)
                .where(ListComment.user_id == user_id)
            )
            entity_comments = (
                select(
                    EntityComment.id, literal("entity"), Entity.title, Entity.slug,
                    EntityComment.body, EntityComment.created_at,
                )
                .join(Entity, Entity.id == EntityComment.entity_id)
                .where(EntityComment.user_id == user_id)
            )
            merged = union_all(list_comments, entity_comments).subquery()
            total = (await self.db.execute(select(func.count()).select_from(merged))).scalar_one()
            rows = (
                await self.db.execute(
                    select(merged).order_by(merged.c.created_at.desc(), merged.c.id).offset(offset).limit(limit)
                )
            ).all()
            return [
                {"id": r.id, "target_kind": r.target_kind, "target_title": r.target_title,
                 "target_slug": r.target_slug, "body": r.body[:300], "created_at": r.created_at}
                for r in rows
            ], total

        if kind == "lists":
            where = (UserList.user_id == user_id, UserList.is_watch_later.is_(False))
            total = (await self.db.execute(select(func.count()).select_from(UserList).where(*where))).scalar_one()
            stmt = select(UserList).where(*where).order_by(UserList.created_at.desc(), UserList.id).offset(offset).limit(limit)
            return [
                {"id": l.id, "title": l.title, "slug": l.slug, "visibility": l.visibility, "created_at": l.created_at}
                for l in (await self.db.execute(stmt)).scalars().all()
            ], total

        model, when = (UserFavorite, UserFavorite.created_at) if kind == "favorites" else (UserRating, UserRating.updated_at)
        total = (await self.db.execute(select(func.count()).select_from(model).where(model.user_id == user_id))).scalar_one()
        stmt = (
            select(model, Entity).join(Entity, Entity.id == model.entity_id)
            .where(model.user_id == user_id).order_by(when.desc(), model.id).offset(offset).limit(limit)
        )
        out = []
        for item, entity in (await self.db.execute(stmt)).all():
            row = {
                "id": item.id, "entity_type": entity.entity_type, "entity_title": entity.title,
                "entity_slug": entity.slug,
                "created_at": item.created_at if kind == "favorites" else item.updated_at,
            }
            if kind == "ratings":
                row["score"] = item.score
            out.append(row)
        return out, total
