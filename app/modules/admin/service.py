import logging
import uuid
from datetime import datetime, timezone

from fastapi import Request
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, RateLimitedError, UnauthorizedError, ValidationError
from app.core.rate_limit import client_ip, hit_local
from app.core.security import create_admin_access_token, hash_password, verify_password
from app.modules.admin.audit import AuditLogService, diff
from app.modules.admin.models import AdminAccount
from app.modules.admin.repository import AdminAccountRepository, AdminListRepository
from app.modules.lists.models import UserList
from app.modules.admin.schemas import AdminListItemRow, AdminListRow, AdminListUpdate, AdminLogin, AdminPasswordChange, AdminPublic, AdminTokenResponse

logger = logging.getLogger(__name__)

# Applies per-admin, not per-IP: an attacker who has to also guess/steal a
# valid short-lived admin JWT before hitting this endpoint at all is already
# a narrow case, so a simple per-account window is enough to blunt brute-forcing
# the current password.
PASSWORD_CHANGE_RATE_LIMIT = 5
PASSWORD_CHANGE_RATE_WINDOW_SECONDS = 15 * 60


class AdminAuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = AdminAccountRepository(db)

    async def login(self, payload: AdminLogin, request: Request | None = None) -> AdminTokenResponse:
        admin = await self.repo.get_by_email(payload.email)
        if not admin or not verify_password(payload.password, admin.password_hash):
            from app.modules.alerts.service import note_admin_login_failure

            note_admin_login_failure(client_ip(request) if request else None, payload.email)
            raise UnauthorizedError("Invalid email or password")
        if not admin.is_active:
            raise UnauthorizedError("This admin account is disabled")

        await self.repo.mark_logged_in(admin)
        await AuditLogService(self.db).record(admin, "admin.login", "admin", admin.id, request=request)
        await self.db.commit()

        return AdminTokenResponse(
            access_token=create_admin_access_token(str(admin.id)),
            admin=AdminPublic.model_validate(admin),
        )

    async def change_password(
        self, admin: AdminAccount, payload: AdminPasswordChange, redis: Redis, request: Request | None = None
    ) -> None:
        await self._enforce_password_change_rate_limit(redis, admin.id)

        if not verify_password(payload.current_password, admin.password_hash):
            raise UnauthorizedError("Current password is incorrect")

        if payload.new_password == payload.current_password:
            raise ValidationError("New password must be different from the current password")

        await self.repo.update_password(admin, hash_password(payload.new_password))
        await AuditLogService(self.db).record(admin, "admin.password_change", "admin", admin.id, request=request)
        await self.db.commit()

    @staticmethod
    async def _enforce_password_change_rate_limit(redis: Redis, admin_id: uuid.UUID) -> None:
        key = f"admin:password_change_attempts:{admin_id}"
        try:
            attempts = await redis.incr(key)
            if attempts == 1:
                await redis.expire(key, PASSWORD_CHANGE_RATE_WINDOW_SECONDS)
        except RedisError:
            # Redis is optional: count in this process's memory so the limit
            # still holds (per process, reset on restart) instead of vanishing.
            logger.warning(
                "Redis unavailable, using in-process password-change rate limit for admin_id=%s", admin_id
            )
            attempts = hit_local(key, PASSWORD_CHANGE_RATE_WINDOW_SECONDS)

        if attempts > PASSWORD_CHANGE_RATE_LIMIT:
            raise RateLimitedError("Too many password change attempts. Try again later.")


class AdminListService:
    """Curation of user lists: which are featured (and in what order) and
    which are hidden from public discovery. No list is ever deleted here."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = AdminListRepository(db)

    @staticmethod
    def _curation(lst: UserList) -> dict:
        return {
            "is_featured": lst.is_featured,
            "featured_order": lst.featured_order,
            "is_hidden_from_discovery": lst.is_hidden_from_discovery,
            "curation_note": lst.curation_note,
        }

    def _row(self, lst: UserList, item_count: int) -> AdminListRow:
        return AdminListRow(
            id=lst.id,
            title=lst.title,
            slug=lst.slug,
            owner_username=lst.owner.username if lst.owner else None,
            entity_type=lst.entity_type,
            visibility=lst.visibility,
            item_count=item_count,
            like_count=lst.like_count,
            comment_count=lst.comment_count,
            created_at=lst.created_at,
            is_featured=lst.is_featured,
            featured_order=lst.featured_order,
            is_hidden_from_discovery=lst.is_hidden_from_discovery,
            curation_note=lst.curation_note,
        )

    async def search(self, **filters) -> tuple[list[AdminListRow], int]:
        rows, total = await self.repo.search(**filters)
        return [self._row(lst, count) for lst, count in rows], total

    async def featured(self) -> list[AdminListRow]:
        out = []
        for lst in await self.repo.featured():
            out.append(self._row(lst, await self.repo.item_count(lst.id)))
        return out

    async def update(
        self, admin: AdminAccount, list_id: uuid.UUID, payload: AdminListUpdate, request: Request | None = None
    ) -> AdminListRow:
        lst = await self.repo.get(list_id)
        if lst is None or lst.is_watch_later:
            raise NotFoundError("List not found")
        fields = payload.model_fields_set
        curation_before = self._curation(lst)

        if payload.is_featured is True and not lst.is_featured:
            if lst.visibility != "public":
                raise ValidationError("Only public lists can be featured")
            lst.is_featured = True
            lst.featured_at = datetime.now(timezone.utc)
            lst.curated_by_admin_id = admin.id
            if payload.featured_order is None:
                lst.featured_order = await self.repo.max_featured_order() + 1
        elif payload.is_featured is False and lst.is_featured:
            lst.is_featured = False
            lst.featured_at = None
            lst.featured_order = None
            lst.curated_by_admin_id = admin.id
        if payload.featured_order is not None and lst.is_featured:
            lst.featured_order = payload.featured_order

        if payload.is_hidden_from_discovery is not None:
            lst.is_hidden_from_discovery = payload.is_hidden_from_discovery
            lst.curated_by_admin_id = admin.id
        if "curation_note" in fields:
            lst.curation_note = (payload.curation_note or "").strip() or None

        await self.db.flush()
        row = self._row(lst, await self.repo.item_count(lst.id))
        changed_before, changed_after = diff(curation_before, self._curation(lst))
        if changed_after:
            await AuditLogService(self.db).record(
                admin, "list.update", "list", list_id, before=changed_before, after=changed_after, request=request
            )
        await self.db.commit()
        if payload.is_featured is True and lst.is_featured and not curation_before.get("is_featured"):
            from app.modules.notifications import service as notifications

            await notifications.notify_later(
                recipient_id=lst.user_id, actor_id=None, type="list_featured", target_type="list",
                target_id=lst.id, payload={"list_title": lst.title, "list_slug": lst.slug},
            )
        logger.info("admin %s curated list %s: %s", admin.id, list_id, payload.model_dump(exclude_unset=True))
        return row

    async def delete(self, admin: AdminAccount, list_id: uuid.UUID, request: Request | None = None) -> None:
        lst = await self.repo.get(list_id)
        if lst is None or lst.is_watch_later:
            raise NotFoundError("List not found")
        title, slug = lst.title, lst.slug
        await self.db.delete(lst)  # items, likes, comments, slug history cascade
        await AuditLogService(self.db).record(
            admin, "list.delete", "list", list_id, before={"title": title, "slug": slug}, request=request
        )
        await self.db.commit()
        logger.info("admin %s DELETED list %s (%s, %r)", admin.id, list_id, slug, title)

    async def items(self, list_id: uuid.UUID) -> list[AdminListItemRow]:
        if await self.repo.get(list_id) is None:
            raise NotFoundError("List not found")
        return [
            AdminListItemRow(
                id=i.id, position=i.position, entity_id=e.id, entity_type=e.entity_type,
                title=e.title, slug=e.slug, added_by_username=u,
            )
            for i, e, u in await self.repo.items(list_id)
        ]

    async def remove_item(
        self, admin: AdminAccount, list_id: uuid.UUID, item_id: uuid.UUID, request: Request | None = None
    ) -> list[AdminListItemRow]:
        item = await self.repo.get_item(list_id, item_id)
        if item is None:
            raise NotFoundError("Item not found in this list")
        await AuditLogService(self.db).record(
            admin, "list.item_remove", "list", list_id,
            before={"item_id": str(item_id), "entity_id": str(item.entity_id), "position": item.position}, request=request,
        )
        await self.db.delete(item)
        await self.db.commit()
        logger.info("admin %s removed item %s from list %s", admin.id, item_id, list_id)
        return await self.items(list_id)

    async def reorder_items(
        self, admin: AdminAccount, list_id: uuid.UUID, item_ids: list[uuid.UUID], request: Request | None = None
    ) -> list[AdminListItemRow]:
        current = {i.id for i, _, _ in await self.repo.items(list_id)}
        if set(item_ids) != current or len(item_ids) != len(current):
            raise ValidationError("item_ids must contain exactly the list's current items")
        for position, item_id in enumerate(item_ids):
            (await self.repo.get_item(list_id, item_id)).position = position
        await AuditLogService(self.db).record(
            admin, "list.items_reorder", "list", list_id, after={"item_ids": [str(i) for i in item_ids]}, request=request
        )
        await self.db.commit()
        logger.info("admin %s reordered items of list %s", admin.id, list_id)
        return await self.items(list_id)

    async def reorder_featured(
        self, admin: AdminAccount, ids: list[uuid.UUID], request: Request | None = None
    ) -> list[AdminListRow]:
        featured = {lst.id: lst for lst in await self.repo.featured()}
        if any(i not in featured for i in ids):
            raise ValidationError("Every id must be a currently featured list")
        # Listed ids take positions 0..n-1 in the given order; any featured
        # list left out keeps its relative order after them.
        listed = set(ids)
        rest = [i for i in featured if i not in listed]
        for position, list_id in enumerate([*ids, *rest]):
            featured[list_id].featured_order = position
        await AuditLogService(self.db).record(
            admin, "list.featured_reorder", "list", "featured", after={"ids": [str(i) for i in ids]}, request=request
        )
        await self.db.commit()
        logger.info("admin %s reordered featured lists: %s", admin.id, [str(i) for i in ids])
        return await self.featured()
