import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.models import User, UserRating


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_email(self, email: str) -> User | None:
        result = await self.db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return await self.db.get(User, user_id)

    async def create(self, email: str, username: str, hashed_password: str) -> User:
        user = User(email=email, username=username, hashed_password=hashed_password)
        self.db.add(user)
        await self.db.flush()
        return user

    async def get_rating(self, user_id: uuid.UUID, entity_id: uuid.UUID) -> UserRating | None:
        result = await self.db.execute(
            select(UserRating).where(UserRating.user_id == user_id, UserRating.entity_id == entity_id)
        )
        return result.scalar_one_or_none()

    async def upsert_rating(self, user_id: uuid.UUID, entity_id: uuid.UUID, score: int) -> UserRating:
        rating = await self.get_rating(user_id, entity_id)
        if rating:
            rating.score = score
        else:
            rating = UserRating(user_id=user_id, entity_id=entity_id, score=score)
            self.db.add(rating)
        await self.db.flush()
        return rating

    async def delete_rating(self, user_id: uuid.UUID, entity_id: uuid.UUID) -> bool:
        rating = await self.get_rating(user_id, entity_id)
        if not rating:
            return False
        await self.db.delete(rating)
        await self.db.flush()
        return True

    async def list_ratings(self, user_id: uuid.UUID) -> list[UserRating]:
        result = await self.db.execute(select(UserRating).where(UserRating.user_id == user_id))
        return list(result.scalars().all())
