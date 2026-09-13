import logging
import uuid

from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import RateLimitedError, UnauthorizedError, ValidationError
from app.core.security import create_admin_access_token, hash_password, verify_password
from app.modules.admin.models import AdminAccount
from app.modules.admin.repository import AdminAccountRepository
from app.modules.admin.schemas import AdminLogin, AdminPasswordChange, AdminPublic, AdminTokenResponse

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

    async def login(self, payload: AdminLogin) -> AdminTokenResponse:
        admin = await self.repo.get_by_email(payload.email)
        if not admin or not verify_password(payload.password, admin.password_hash):
            raise UnauthorizedError("Invalid email or password")
        if not admin.is_active:
            raise UnauthorizedError("This admin account is disabled")

        await self.repo.mark_logged_in(admin)
        await self.db.commit()

        return AdminTokenResponse(
            access_token=create_admin_access_token(str(admin.id)),
            admin=AdminPublic.model_validate(admin),
        )

    async def change_password(self, admin: AdminAccount, payload: AdminPasswordChange, redis: Redis) -> None:
        await self._enforce_password_change_rate_limit(redis, admin.id)

        if not verify_password(payload.current_password, admin.password_hash):
            raise UnauthorizedError("Current password is incorrect")

        if payload.new_password == payload.current_password:
            raise ValidationError("New password must be different from the current password")

        await self.repo.update_password(admin, hash_password(payload.new_password))
        await self.db.commit()

    @staticmethod
    async def _enforce_password_change_rate_limit(redis: Redis, admin_id: uuid.UUID) -> None:
        key = f"admin:password_change_attempts:{admin_id}"
        try:
            attempts = await redis.incr(key)
            if attempts == 1:
                await redis.expire(key, PASSWORD_CHANGE_RATE_WINDOW_SECONDS)
        except RedisError:
            # This endpoint already sits behind get_current_admin (a valid JWT
            # required), so the rate limit is a secondary defense, not the
            # only thing standing between an attacker and this route -- unlike
            # /auth/login, which is unauthenticated. Failing open here (skip
            # the limit rather than 500 the whole request) is the safer
            # trade-off until Redis is actually provisioned in this
            # environment. Once genuine unauthenticated rate limiting (e.g.
            # on /auth/login) is needed, that's the point to provision Redis
            # for real rather than extend this fail-open behavior to it.
            logger.warning(
                "Redis unavailable, skipping password-change rate limit for admin_id=%s", admin_id
            )
            return

        if attempts > PASSWORD_CHANGE_RATE_LIMIT:
            raise RateLimitedError("Too many password change attempts. Try again later.")
