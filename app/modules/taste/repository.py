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

    async def list_dimensions(
        self, user_id: uuid.UUID, dimension_type: str | None = None
    ) -> list[UserTasteDimension]:
        """
        Ordered score DESC, with confidence DESC, sample_size DESC, then
        dimension_key ASC as tiebreakers -- score ties are common (e.g.
        several genres landing on the same rounded score), and without a
        deterministic tiebreak chain, which rows end up "on top" (e.g. for
        TasteSnapshotComputer's label) would depend on Postgres's
        unspecified order for equal sort keys and could vary between runs.
        """
        stmt = select(UserTasteDimension).where(UserTasteDimension.user_id == user_id)
        if dimension_type:
            stmt = stmt.where(UserTasteDimension.dimension_type == dimension_type)
        stmt = stmt.order_by(
            UserTasteDimension.score.desc(),
            UserTasteDimension.confidence.desc(),
            UserTasteDimension.sample_size.desc(),
            UserTasteDimension.dimension_key.asc(),
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

    async def get_insight(self, user_id: uuid.UUID, include_stale: bool = False) -> UserTasteInsight | None:
        """Single-row-per-user table (see replace_insight below) -- mirrors get_snapshot's shape."""
        stmt = select(UserTasteInsight).where(UserTasteInsight.user_id == user_id)
        if not include_stale:
            stmt = stmt.where(UserTasteInsight.stale.is_(False))
        stmt = stmt.order_by(UserTasteInsight.generated_at.desc()).limit(1)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

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

    async def replace_snapshot(self, user_id: uuid.UUID, entity_scope: str, row: dict | None) -> None:
        """
        Single-row-per-(user_id, entity_scope) table, unlike dimensions/
        anchors: deletes whatever is there for this user+scope, then
        inserts the fresh snapshot if one was computed. row=None just
        clears it -- the empty-state case when a user has no qualifying
        dimensions yet.
        """
        await self.db.execute(
            delete(UserTasteSnapshot).where(
                UserTasteSnapshot.user_id == user_id,
                UserTasteSnapshot.entity_scope == entity_scope,
            )
        )
        if row is not None:
            self.db.add(UserTasteSnapshot(user_id=user_id, entity_scope=entity_scope, **row))
        await self.db.flush()

    async def replace_insight(self, user_id: uuid.UUID, row: dict | None) -> None:
        """
        Single-row-per-user table, same contract as replace_snapshot:
        deletes whatever insight is there for this user, then inserts the
        fresh one if one was computed. row=None just clears it.
        """
        await self.db.execute(delete(UserTasteInsight).where(UserTasteInsight.user_id == user_id))
        if row is not None:
            self.db.add(UserTasteInsight(user_id=user_id, **row))
        await self.db.flush()

    async def bulk_upsert_anchors(self, user_id: uuid.UUID, rows: list[dict]) -> None:
        """
        Full refresh of one user's taste anchors: upserts every row in
        `rows` (each a dict with entity_id, anchor_strength, match_score,
        rank) and deletes any existing anchor for this user whose
        entity_id isn't in the new set. Same "replace with exactly this
        set" contract as bulk_upsert_dimensions.
        """
        delete_stmt = delete(UserTasteAnchor).where(UserTasteAnchor.user_id == user_id)
        entity_ids = [row["entity_id"] for row in rows]
        if entity_ids:
            delete_stmt = delete_stmt.where(UserTasteAnchor.entity_id.notin_(entity_ids))
        await self.db.execute(delete_stmt)

        if rows:
            stmt = pg_insert(UserTasteAnchor).values([{"user_id": user_id, **row} for row in rows])
            stmt = stmt.on_conflict_do_update(
                index_elements=["user_id", "entity_id"],
                set_={
                    "anchor_strength": stmt.excluded.anchor_strength,
                    "match_score": stmt.excluded.match_score,
                    "rank": stmt.excluded.rank,
                    "computed_at": func.now(),
                },
            )
            await self.db.execute(stmt)

        await self.db.flush()
