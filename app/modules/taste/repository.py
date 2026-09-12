import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.taste.models import (
    UserContributionStats,
    UserTasteAnchor,
    UserTasteDimension,
    UserTasteInsight,
    UserTasteSnapshot,
)


class TasteRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_snapshot(self, user_id: uuid.UUID, entity_scope: str = "movie") -> UserTasteSnapshot | None:
        stmt = (
            select(UserTasteSnapshot)
            .where(UserTasteSnapshot.user_id == user_id, UserTasteSnapshot.entity_scope == entity_scope)
            .order_by(UserTasteSnapshot.computed_at.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_dimensions(self, user_id: uuid.UUID) -> list[UserTasteDimension]:
        stmt = (
            select(UserTasteDimension)
            .where(UserTasteDimension.user_id == user_id)
            .order_by(UserTasteDimension.score.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_anchors_with_entities(self, user_id: uuid.UUID, limit: int = 10) -> list[tuple]:
        from app.modules.entities.models import Entity

        stmt = (
            select(UserTasteAnchor, Entity)
            .join(Entity, Entity.id == UserTasteAnchor.entity_id)
            .where(UserTasteAnchor.user_id == user_id)
            .order_by(UserTasteAnchor.rank.asc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return result.all()

    async def list_insights(self, user_id: uuid.UUID, include_stale: bool = False) -> list[UserTasteInsight]:
        stmt = select(UserTasteInsight).where(UserTasteInsight.user_id == user_id)
        if not include_stale:
            stmt = stmt.where(UserTasteInsight.stale.is_(False))
        stmt = stmt.order_by(UserTasteInsight.generated_at.desc())
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_contribution_stats(self, user_id: uuid.UUID) -> UserContributionStats | None:
        return await self.db.get(UserContributionStats, user_id)

    async def bulk_upsert_dimensions(
        self, user_id: uuid.UUID, dimension_type: str, rows: list[dict]
    ) -> None:
        """
        Full refresh of one user's dimensions for a given dimension_type:
        upserts every row in `rows` (each a dict with dimension_key, score,
        confidence, sample_size) and deletes any existing row for this
        (user_id, dimension_type) whose dimension_key isn't in the new set.
        Callers pass exactly the set that should exist afterwards -- e.g.
        already filtered by confidence threshold -- there's no partial-
        update mode.
        """
        delete_stmt = delete(UserTasteDimension).where(
            UserTasteDimension.user_id == user_id,
            UserTasteDimension.dimension_type == dimension_type,
        )
        keys = [row["dimension_key"] for row in rows]
        if keys:
            delete_stmt = delete_stmt.where(UserTasteDimension.dimension_key.notin_(keys))
        await self.db.execute(delete_stmt)

        if rows:
            stmt = pg_insert(UserTasteDimension).values(
                [{"user_id": user_id, "dimension_type": dimension_type, **row} for row in rows]
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=["user_id", "dimension_type", "dimension_key"],
                set_={
                    "score": stmt.excluded.score,
                    "confidence": stmt.excluded.confidence,
                    "sample_size": stmt.excluded.sample_size,
                    "updated_at": func.now(),
                },
            )
            await self.db.execute(stmt)

        await self.db.flush()
