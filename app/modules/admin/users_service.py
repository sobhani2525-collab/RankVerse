import uuid
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache, cached
from app.core.exceptions import AlreadyExistsError, NotFoundError, RankVerseError, ValidationError
from app.core.rate_limit import enforce
from app.modules.admin.audit import AuditLogService, diff
from app.modules.admin.models import AdminAccount
from app.modules.admin.users_export import EXPORT_ROW_CAP
from app.modules.admin.users_repository import AdminUserRepository, user_status
from app.modules.admin.users_schemas import (
    AdminUserBlock, AdminUserBulk, AdminUserBulkFailure, AdminUserBulkResult, AdminUserDetail, AdminUserRow,
    AdminUserStats, AdminUserUpdate,
)
from app.modules.users.models import User
from app.modules.users.service import UserService

# Per admin: generous for hand-driven moderation, tight enough to stop a runaway script.
WRITE_RATE_LIMIT = 60
WRITE_RATE_WINDOW_SECONDS = 10 * 60
BULK_RATE_LIMIT = 10
BULK_FILTER_CAP = 5000
EXPORT_RATE_LIMIT = 10
STATS_TTL_SECONDS = 60
STATS_CACHE_KEY = "admin:users:stats"
ACTIVITY_KINDS = ("ratings", "favorites", "lists", "comments")

EDITABLE_SNAPSHOT_FIELDS = ("display_name", "bio", "email", "username", "admin_note", "email_verified_at")


def _pct_change(current: int, previous: int) -> float | None:
    if previous == 0:
        return None
    return round((current - previous) / previous * 100, 1)


class AdminUserService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = AdminUserRepository(db)
        self.audit = AuditLogService(db)

    # --- reads ----------------------------------------------------------

    @staticmethod
    def _row(user: User, counts: dict[str, int]) -> AdminUserRow:
        return AdminUserRow(
            id=user.id, email=user.email, username=user.username, display_name=user.display_name,
            avatar_key=user.avatar_key, status=user_status(user),
            email_verified=user.email_verified_at is not None,
            created_at=user.created_at, last_login_at=user.last_login_at,
            ratings_count=counts["ratings"], lists_count=counts["lists"], comments_count=counts["comments"],
        )

    async def search(self, **params) -> tuple[list[AdminUserRow], int]:
        users, total = await self.repo.search(**params)
        counts = await self.repo.counts_for([u.id for u in users])
        return [self._row(u, counts[u.id]) for u in users], total

    async def stats(self) -> AdminUserStats:
        async def load() -> dict:
            now = datetime.now(timezone.utc)
            day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            return await self.repo.stats(now, day_start)

        raw = await cached(STATS_CACHE_KEY, STATS_TTL_SECONDS, load)
        return AdminUserStats(
            total=raw["total"], new_7d=raw["new_7d"],
            new_7d_change_pct=_pct_change(raw["new_7d"], raw["prev_7d"]),
            new_30d=raw["new_30d"], new_30d_change_pct=_pct_change(raw["new_30d"], raw["prev_30d"]),
            active_today=raw["active_today"], blocked=raw["blocked"],
            unverified=raw["unverified"], deleted=raw["deleted"],
        )

    async def _get(self, user_id: uuid.UUID) -> User:
        user = await self.repo.get(user_id)
        if user is None:
            raise NotFoundError("User not found")
        return user

    async def detail(self, user_id: uuid.UUID) -> AdminUserDetail:
        return await self._detail(await self._get(user_id))

    async def _detail(self, user: User) -> AdminUserDetail:
        counts = await self.repo.detail_counts(user.id)
        base = self._row(user, counts)
        return AdminUserDetail(
            **base.model_dump(),
            bio=user.bio, admin_note=user.admin_note, email_verified_at=user.email_verified_at,
            favorites_count=counts["favorites"], battle_votes_count=counts["battle_votes"],
            blocked_at=user.blocked_at, blocked_reason=user.blocked_reason,
            blocked_by_admin_id=user.blocked_by_admin_id,
            blocked_by_admin_email=await self.repo.admin_email(user.blocked_by_admin_id),
            deleted_at=user.deleted_at,
        )

    async def activity(self, user_id: uuid.UUID, kind: str, page: int, page_size: int) -> tuple[list[dict], int]:
        await self._get(user_id)
        return await self.repo.activity(user_id, kind, page, page_size)

    async def audit_logs(self, user_id: uuid.UUID, page: int, page_size: int):
        await self._get(user_id)
        return await self.audit.for_target("user", user_id, page, page_size)

    # --- writes ---------------------------------------------------------

    @staticmethod
    async def _throttle(admin: AdminAccount) -> None:
        await enforce("admin-users-write", str(admin.id), WRITE_RATE_LIMIT, WRITE_RATE_WINDOW_SECONDS)

    async def _commit(self) -> None:
        await self.db.commit()
        # The stats tiles change with most writes here.
        cache.invalidate(STATS_CACHE_KEY)

    async def update(self, admin: AdminAccount, user_id: uuid.UUID, payload: AdminUserUpdate, request: Request) -> AdminUserDetail:
        await self._throttle(admin)
        user = await self._get(user_id)
        sent = payload.model_fields_set & {"display_name", "bio", "email", "username", "admin_note"}

        for field in ("email", "username"):
            if field in sent and getattr(payload, field) is None:
                raise ValidationError(f"{field} cannot be empty")
        if "email" in sent and await self.repo.taken(User.email, payload.email, user.id):
            raise AlreadyExistsError("A user with this email already exists")
        if "username" in sent and await self.repo.taken(User.username, payload.username, user.id):
            raise AlreadyExistsError("A user with this username already exists")

        before = {f: getattr(user, f) for f in EDITABLE_SNAPSHOT_FIELDS}
        for field in sent:
            value = getattr(payload, field)
            setattr(user, field, (value or None) if field in ("display_name", "bio", "admin_note") else value)
        if "email" in sent and user.email != before["email"]:
            # A verification proves the *old* address; the new one is unproven.
            user.email_verified_at = None

        changed_before, changed_after = diff(before, {f: getattr(user, f) for f in EDITABLE_SNAPSHOT_FIELDS})
        if changed_after:
            await self.audit.record(
                admin, "user.update", "user", user.id,
                before=_jsonable(changed_before), after=_jsonable(changed_after), request=request,
            )
        try:
            await self.db.flush()
        except IntegrityError:
            await self.db.rollback()
            raise AlreadyExistsError("A user with this email or username already exists")
        await self._commit()
        return await self._detail(user)

    # --- single-user moderation actions ----------------------------------
    # Each _apply_* mutates the user and records the audit row but does NOT
    # commit: the single-user endpoints commit right after, bulk commits once
    # per batch. They return False when the user is already in the target
    # state (idempotent no-op) and raise ValidationError when the action
    # can't apply at all.

    async def _apply_block(self, admin, user: User, reason: str, request, bulk=False) -> bool:
        if user.deleted_at is not None:
            raise ValidationError("A deleted user cannot be blocked; restore the user first")
        if not user.is_active:
            return False
        user.is_active = False
        user.blocked_at = datetime.now(timezone.utc)
        user.blocked_reason = reason
        user.blocked_by_admin_id = admin.id
        await self.audit.record(
            admin, "user.block", "user", user.id,
            before={"status": "active"}, after=_with_bulk({"status": "blocked", "reason": reason}, bulk), request=request,
        )
        return True

    async def _apply_unblock(self, admin, user: User, request, bulk=False) -> bool:
        if user.deleted_at is not None:
            raise ValidationError("A deleted user cannot be unblocked; restore the user first")
        if user.is_active:
            return False
        previous_reason = user.blocked_reason
        user.is_active = True
        user.blocked_at = user.blocked_reason = user.blocked_by_admin_id = None
        await self.audit.record(
            admin, "user.unblock", "user", user.id,
            before={"status": "blocked", "reason": previous_reason}, after=_with_bulk({"status": "active"}, bulk), request=request,
        )
        return True

    async def _apply_delete(self, admin, user: User, request, bulk=False) -> bool:
        if user.deleted_at is not None:
            return False
        previous = user_status(user)
        user.deleted_at = datetime.now(timezone.utc)
        await self.audit.record(
            admin, "user.delete", "user", user.id,
            before={"status": previous}, after=_with_bulk({"status": "deleted"}, bulk), request=request,
        )
        return True

    async def _apply_restore(self, admin, user: User, request, bulk=False) -> bool:
        if user.deleted_at is None:
            return False
        user.deleted_at = None
        await self.audit.record(
            admin, "user.restore", "user", user.id,
            before={"status": "deleted"}, after=_with_bulk({"status": user_status(user)}, bulk), request=request,
        )
        return True

    async def _apply_verify_email(self, admin, user: User, request, bulk=False) -> bool:
        if user.email_verified_at is not None:
            return False
        user.email_verified_at = datetime.now(timezone.utc)
        await self.audit.record(
            admin, "user.verify_email", "user", user.id,
            before={"email_verified": False}, after=_with_bulk({"email_verified": True}, bulk), request=request,
        )
        return True

    async def _single(self, admin: AdminAccount, user_id: uuid.UUID, apply) -> AdminUserDetail:
        await self._throttle(admin)
        user = await self._get(user_id)
        if await apply(user):
            await self._commit()
        return await self._detail(user)

    async def block(self, admin: AdminAccount, user_id: uuid.UUID, payload: AdminUserBlock, request: Request) -> AdminUserDetail:
        return await self._single(admin, user_id, lambda u: self._apply_block(admin, u, payload.reason, request))

    async def unblock(self, admin: AdminAccount, user_id: uuid.UUID, request: Request) -> AdminUserDetail:
        return await self._single(admin, user_id, lambda u: self._apply_unblock(admin, u, request))

    async def delete(self, admin: AdminAccount, user_id: uuid.UUID, request: Request) -> AdminUserDetail:
        return await self._single(admin, user_id, lambda u: self._apply_delete(admin, u, request))

    async def restore(self, admin: AdminAccount, user_id: uuid.UUID, request: Request) -> AdminUserDetail:
        return await self._single(admin, user_id, lambda u: self._apply_restore(admin, u, request))

    async def verify_email(self, admin: AdminAccount, user_id: uuid.UUID, request: Request) -> AdminUserDetail:
        return await self._single(admin, user_id, lambda u: self._apply_verify_email(admin, u, request))

    # --- bulk -----------------------------------------------------------

    async def bulk(self, admin: AdminAccount, payload: AdminUserBulk, request: Request) -> AdminUserBulkResult:
        await enforce("admin-users-bulk", str(admin.id), BULK_RATE_LIMIT, WRITE_RATE_WINDOW_SECONDS)

        if payload.ids is not None:
            ids = list(dict.fromkeys(payload.ids))
        else:
            ids = await self.repo.ids_matching(payload.filter.model_dump(exclude_none=True), BULK_FILTER_CAP + 1)
            if len(ids) > BULK_FILTER_CAP:
                raise ValidationError(f"The filter matches more than {BULK_FILTER_CAP} users; narrow it down")

        users = {u.id: u for u in await self.repo.get_many(ids)}
        result = AdminUserBulkResult()
        for user_id in ids:
            user = users.get(user_id)
            if user is None:
                result.failed.append(AdminUserBulkFailure(id=user_id, reason="User not found"))
                continue
            try:
                # A savepoint per user: one row's failure rolls back only that row.
                async with self.db.begin_nested():
                    changed = await self._apply_bulk_one(admin, user, payload, request)
            except Exception as exc:  # noqa: BLE001 - reported per row, never aborts the batch
                message = exc.message if isinstance(exc, RankVerseError) else "Unexpected error"
                result.failed.append(AdminUserBulkFailure(id=user_id, reason=message))
                continue
            (result.succeeded if changed else result.skipped).append(user_id)

        await self._commit()
        return result

    async def _apply_bulk_one(self, admin, user: User, payload: AdminUserBulk, request) -> bool:
        action = payload.action
        if action == "block":
            return await self._apply_block(admin, user, payload.reason or "", request, bulk=True)
        if action == "unblock":
            return await self._apply_unblock(admin, user, request, bulk=True)
        if action == "delete":
            return await self._apply_delete(admin, user, request, bulk=True)
        if action == "restore":
            return await self._apply_restore(admin, user, request, bulk=True)
        return await self._apply_verify_email(admin, user, request, bulk=True)

    async def prepare_export(self, admin: AdminAccount, request: Request, *, filters: dict, ids, columns: list[str], fmt: str) -> int:
        """Checks the size cap and records the audit event; the router then streams the rows."""
        await enforce("admin-users-export", str(admin.id), EXPORT_RATE_LIMIT, WRITE_RATE_WINDOW_SECONDS)
        total = await self.repo.count_matching(ids=ids, **filters)
        if total > EXPORT_ROW_CAP:
            raise ValidationError(
                f"The export would contain {total} users; the limit is {EXPORT_ROW_CAP}. Narrow the filters and try again"
            )
        await self.audit.record(
            admin, "user.export", "user", "export",
            after={
                "format": fmt, "columns": columns, "rows": total,
                "selected_ids": len(ids) if ids is not None else None,
                "filters": _jsonable(filters),
            },
            request=request,
        )
        await self._commit()
        return total

    async def password_reset_link(self, admin: AdminAccount, user_id: uuid.UUID, request: Request) -> tuple[User, str]:
        """Issues a reset link through the normal forgot-password flow; the caller emails it."""
        await self._throttle(admin)
        user = await self._get(user_id)
        if user.deleted_at is not None:
            raise ValidationError("A deleted user cannot receive a password reset")
        link = await UserService(self.db).request_password_reset(user.email)
        if link is None:
            raise ValidationError("Could not issue a password reset")
        await self.audit.record(admin, "user.send_password_reset", "user", user.id, request=request)
        await self._commit()
        return user, link


def _with_bulk(after: dict, bulk: bool) -> dict:
    return {**after, "bulk": True} if bulk else after


def _jsonable(data: dict) -> dict:
    return {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in data.items()}
