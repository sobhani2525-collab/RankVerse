import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AlreadyExistsError, NotFoundError, UnauthorizedError
from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token
from app.modules.entities.repository import EntityRepository
from app.modules.ranking.service import RankingService
from app.modules.users.repository import UserRepository
from app.modules.users.schemas import UserCreate, UserLogin, TokenPair


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

        return TokenPair(
            access_token=create_access_token(str(user.id)),
            refresh_token=create_refresh_token(str(user.id)),
        )

    async def rate_movie(self, user_id: uuid.UUID, entity_slug: str, score: int):
        entity_repo = EntityRepository(self.db)
        entity = await entity_repo.get_by_slug(entity_slug, entity_type="movie")
        if not entity:
            raise NotFoundError(f"Movie '{entity_slug}' not found")

        rating = await self.repo.upsert_rating(user_id, entity.id, score)

        # Recompute this single entity's score immediately for responsiveness.
        # The full batch job still runs periodically to catch platform-average drift.
        ranking_service = RankingService(self.db)
        await ranking_service.recompute_entity(entity)

        await self.db.commit()
        return rating

    async def unrate_movie(self, user_id: uuid.UUID, entity_slug: str):
        entity_repo = EntityRepository(self.db)
        entity = await entity_repo.get_by_slug(entity_slug, entity_type="movie")
        if not entity:
            raise NotFoundError(f"Movie '{entity_slug}' not found")

        deleted = await self.repo.delete_rating(user_id, entity.id)
        if deleted:
            ranking_service = RankingService(self.db)
            await ranking_service.recompute_entity(entity)
            await self.db.commit()
        return deleted
