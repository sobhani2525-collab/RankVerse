import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AlreadyExistsError, NotFoundError, UnauthorizedError, ValidationError
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    create_password_reset_token,
    create_email_verification_token,
    decode_token,
)
from app.modules.entities.repository import EntityRepository
from app.modules.ranking.service import RankingService
from app.modules.taste.compute import ContributionStatsComputer
from app.modules.taste import refresh as taste_refresh
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import UserCreate, UserLogin, TokenPair

logger = logging.getLogger(__name__)


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = UserRepository(db)

    async def register(self, payload: UserCreate):
        existing = await self.repo.get_by_email(payload.email)
        if existing:
            raise AlreadyExistsError("A user with this email already exists")

        user = await self.repo.create(
            email=payload.email,
            username=payload.username,
            hashed_password=hash_password(payload.password),
        )
        await self.db.commit()
        return user

    async def login(self, payload: UserLogin) -> TokenPair:
        user = await self.repo.get_by_email(payload.email)
        if not user or not verify_password(payload.password, user.hashed_password):
            raise UnauthorizedError("Invalid email or password")
        if not user.is_active or user.deleted_at is not None:
            raise UnauthorizedError("This account is unavailable")

        user.last_login_at = datetime.now(timezone.utc)
        await self.db.commit()
        return TokenPair(
            access_token=create_access_token(str(user.id), user.hashed_password),
            refresh_token=create_refresh_token(str(user.id), user.hashed_password),
        )

    async def request_password_reset(self, email: str) -> str | None:
        user = await self.repo.get_by_email(email)
        if not user or user.deleted_at is not None:
            # Don't reveal whether the email exists -- caller always gets
            # the same generic response regardless.
            logger.info("Password reset requested for unknown email: %s", email)
            return None

        token = create_password_reset_token(str(user.id))
        reset_link = f"{settings.frontend_base_url}/reset-password?token={token}"

        # The router emails the link in the background (so response time
        # doesn't reveal whether the address exists) and, outside
        # production without real email, also returns it for local testing.
        return reset_link

    async def reset_password(self, token: str, new_password: str) -> None:
        payload = decode_token(token)
        if not payload or payload.get("type") != "password_reset":
            raise UnauthorizedError("Invalid or expired reset link")

        user = await self.repo.get_by_id(uuid.UUID(payload["sub"]))
        if not user or user.deleted_at is not None:
            raise UnauthorizedError("Invalid or expired reset link")

        await self.repo.update_password(user, hash_password(new_password))
        # Opening the emailed reset link proves control of the address.
        await self.repo.mark_email_verified(user)
        await self.db.commit()

    async def change_password(self, user, current_password: str, new_password: str) -> TokenPair:
        # ValidationError (400), not Unauthorized: a wrong current password must
        # not look like an expired session to the client.
        if not verify_password(current_password, user.hashed_password):
            raise ValidationError("رمز عبور فعلی درست نیست")
        if current_password == new_password:
            raise ValidationError("رمز جدید باید با رمز فعلی فرق داشته باشد")
        new_hash = hash_password(new_password)
        user_id = str(user.id)
        await self.repo.update_password(user, new_hash)
        await self.db.commit()
        # The new hash invalidates every token issued for the old password, this
        # session's included: hand back a fresh pair so the caller stays signed in.
        return TokenPair(
            access_token=create_access_token(user_id, new_hash),
            refresh_token=create_refresh_token(user_id, new_hash),
        )

    async def delete_account(self, user, password: str) -> None:
        """Self-service erasure: the account is soft-deleted (so it can't sign in or
        be found) and its personal data is wiped. Email and username are replaced by
        placeholders, which frees both for re-registration. Ratings, battle votes,
        comments and public lists stay, now without a name."""
        if not verify_password(password, user.hashed_password):
            raise ValidationError("رمز عبور درست نیست")
        # Everything the user kept to themselves goes with them (private and
        # unlisted lists, the will-watch list); public lists stay, under the
        # placeholder name below. Items, likes and follows cascade in the DB.
        from app.modules.lists.models import UserList

        await self.db.execute(
            delete(UserList).where(UserList.user_id == user.id, UserList.visibility != "public")
        )
        tag = uuid.uuid4().hex[:12]
        user.email = f"deleted-{tag}@deleted.invalid"
        user.username = f"deleted-{tag}"
        user.hashed_password = hash_password(uuid.uuid4().hex)
        user.display_name = user.bio = user.avatar_key = None
        user.deleted_at = datetime.now(timezone.utc)
        await self.db.commit()

    def email_verification_link(self, user) -> str:
        token = create_email_verification_token(str(user.id), user.email)
        return f"{settings.frontend_base_url}/verify-email?token={token}"

    async def verify_email(self, token: str) -> None:
        payload = decode_token(token)
        if not payload or payload.get("type") != "email_verify":
            raise UnauthorizedError("Invalid or expired verification link")

        user = await self.repo.get_by_id(uuid.UUID(payload["sub"]))
        # A link issued for an old address stops working once it changes.
        if not user or user.email != payload.get("email"):
            raise UnauthorizedError("Invalid or expired verification link")

        await self.repo.mark_email_verified(user)
        await self.db.commit()

    async def _update_contribution_stats(self, user_id: uuid.UUID) -> None:
        """
        Shared by every action that changes a signal Taste DNA reads from (a
        rating, a favorite toggle), before the commit. The rest of Taste DNA
        (dimensions, snapshot, insight, anchors) is refreshed in the
        background once the change is committed -- see taste/refresh.py. The
        nightly batch equivalents still run to catch anyone who acts outside
        the app (sync/import, etc).
        """
        await ContributionStatsComputer(self.db).compute_contribution_stats(user_id)

    async def rate_entity(self, user_id: uuid.UUID, entity_slug: str, score: int, entity_type: str = "movie"):
        entity_repo = EntityRepository(self.db)
        entity = await entity_repo.get_by_slug(entity_slug, entity_type=entity_type)
        if not entity:
            raise NotFoundError(f"{entity_type} '{entity_slug}' not found")

        rating = await self.repo.upsert_rating(user_id, entity.id, score)

        # Recompute this single entity's score immediately for responsiveness.
        # The full batch job still runs periodically to catch platform-average drift.
        ranking_service = RankingService(self.db)
        await ranking_service.recompute_entity(entity)

        await self._update_contribution_stats(user_id)

        await self.db.commit()
        await taste_refresh.refresh(self.db, user_id)
        return rating

    async def unrate_entity(self, user_id: uuid.UUID, entity_slug: str, entity_type: str = "movie"):
        entity_repo = EntityRepository(self.db)
        entity = await entity_repo.get_by_slug(entity_slug, entity_type=entity_type)
        if not entity:
            raise NotFoundError(f"{entity_type} '{entity_slug}' not found")

        deleted = await self.repo.delete_rating(user_id, entity.id)
        if deleted:
            ranking_service = RankingService(self.db)
            await ranking_service.recompute_entity(entity)
            await self._update_contribution_stats(user_id)
            await self.db.commit()
            await taste_refresh.refresh(self.db, user_id)
        return deleted

    async def rate_movie(self, user_id: uuid.UUID, entity_slug: str, score: int):
        return await self.rate_entity(user_id, entity_slug, score, entity_type="movie")

    async def unrate_movie(self, user_id: uuid.UUID, entity_slug: str):
        return await self.unrate_entity(user_id, entity_slug, entity_type="movie")

    async def rate_tv_series(self, user_id: uuid.UUID, entity_slug: str, score: int):
        return await self.rate_entity(user_id, entity_slug, score, entity_type="tv_series")

    async def unrate_tv_series(self, user_id: uuid.UUID, entity_slug: str):
        return await self.unrate_entity(user_id, entity_slug, entity_type="tv_series")

    async def toggle_favorite(self, user_id: uuid.UUID, entity_slug: str, entity_type: str = "movie") -> bool:
        """Returns the new favorited state (True = just favorited, False = just unfavorited)."""
        entity_repo = EntityRepository(self.db)
        entity = await entity_repo.get_by_slug(entity_slug, entity_type=entity_type)
        if not entity:
            raise NotFoundError(f"{entity_type} '{entity_slug}' not found")

        existing = await self.repo.get_favorite(user_id, entity.id)
        if existing:
            await self.repo.remove_favorite(existing)
            favorited = False
        else:
            await self.repo.add_favorite(user_id, entity.id)
            favorited = True

        await self._update_contribution_stats(user_id)
        await self.db.commit()
        await taste_refresh.refresh(self.db, user_id)
        return favorited

    async def favorite_movie(self, user_id: uuid.UUID, entity_slug: str) -> bool:
        return await self.toggle_favorite(user_id, entity_slug, entity_type="movie")

    async def favorite_tv_series(self, user_id: uuid.UUID, entity_slug: str) -> bool:
        return await self.toggle_favorite(user_id, entity_slug, entity_type="tv_series")
