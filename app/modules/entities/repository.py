import uuid

from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.entities.models import Entity, RelationshipEdge, EntityRanking


class EntityRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_slug(self, slug: str, entity_type: str | None = None) -> Entity | None:
        stmt = select(Entity).options(selectinload(Entity.ranking)).where(Entity.slug == slug)
        if entity_type:
            stmt = stmt.where(Entity.entity_type == entity_type)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id(self, entity_id: uuid.UUID) -> Entity | None:
        return await self.db.get(Entity, entity_id)

    async def get_by_external_id(self, external_source: str, external_id: str) -> Entity | None:
        stmt = select(Entity).where(
            Entity.external_source == external_source,
            Entity.external_id == external_id,
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_movies(
        self,
        page: int = 1,
        page_size: int = 20,
        genre_slug: str | None = None,
        year_from: int | None = None,
        year_to: int | None = None,
        sort_by: str = "score",
        entity_type: str = "movie",
    ) -> tuple[list[Entity], int]:
        stmt = select(Entity).options(selectinload(Entity.ranking)).where(Entity.entity_type == entity_type)

        if genre_slug:
            # Filter entities that have a has_genre edge pointing to the genre entity with this slug
            genre_subq = (
                select(RelationshipEdge.from_entity_id)
                .join(Entity, Entity.id == RelationshipEdge.to_entity_id)
                .where(
                    RelationshipEdge.relation_type == "has_genre",
                    Entity.slug == genre_slug,
                )
            )
            stmt = select(Entity).options(selectinload(Entity.ranking)).where(
                    Entity.entity_type == entity_type,
                    Entity.id.in_(genre_subq),
            )

        if year_from:
            stmt = stmt.where(Entity.attributes["year"].as_integer() >= year_from)
        if year_to:
            stmt = stmt.where(Entity.attributes["year"].as_integer() <= year_to)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.db.execute(count_stmt)).scalar_one()

        stmt = stmt.outerjoin(EntityRanking, EntityRanking.entity_id == Entity.id)
        if sort_by == "score":
            stmt = stmt.order_by(EntityRanking.computed_score.desc().nulls_last())
        elif sort_by == "newest":
            stmt = stmt.order_by(Entity.created_at.desc())

        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    async def get_relationships(
        self, entity_id: uuid.UUID, relation_type: str
    ) -> list[RelationshipEdge]:
        stmt = select(RelationshipEdge).options(
            selectinload(RelationshipEdge.to_entity)
        ).where(
            RelationshipEdge.from_entity_id == entity_id,
            RelationshipEdge.relation_type == relation_type,
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_incoming_relationships(
        self, entity_id: uuid.UUID, relation_type: str
    ) -> list[RelationshipEdge]:
        """Edges pointing at entity_id, e.g. a person's directed_by/acted_in credits."""
        stmt = select(RelationshipEdge).options(
            selectinload(RelationshipEdge.from_entity).selectinload(Entity.ranking)
        ).where(
            RelationshipEdge.to_entity_id == entity_id,
            RelationshipEdge.relation_type == relation_type,
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_related(self, entity_id: uuid.UUID, relation_type: str | None = None, limit: int = 12):
        stmt = (
            select(RelationshipEdge)
            .options(selectinload(RelationshipEdge.to_entity))
            .where(RelationshipEdge.from_entity_id == entity_id)
            .order_by(RelationshipEdge.weight.desc())
            .limit(limit)
        )
        if relation_type:
            stmt = stmt.where(RelationshipEdge.relation_type == relation_type)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_shared_connections(self, entity1_id: uuid.UUID, entity2_id: uuid.UUID):
        from sqlalchemy import text
        stmt = text("""
            select r1.relation_type, e.title
            from relationships r1
            join relationships r2
                on r1.to_entity_id = r2.to_entity_id
                and r1.relation_type = r2.relation_type
            join entities e on e.id = r1.to_entity_id
            where r1.from_entity_id = :e1
            and r2.from_entity_id = :e2
            and r1.relation_type in ('directed_by', 'has_genre', 'acted_in')
        """)
        result = await self.db.execute(stmt, {"e1": str(entity1_id), "e2": str(entity2_id)})
        return result.all()

    async def find_top_shared_relation(
        self, entity_ids: list[uuid.UUID], min_shared: int
    ) -> list[tuple[str, uuid.UUID, str, int]]:
        """
        All (relation_type, target_entity_id) pairs that at least
        `min_shared` of entity_ids point to via an outgoing edge, each with
        the target's title and how many of entity_ids share it. One simple
        indexed aggregate query (from_entity_id is indexed) -- callers pick
        the best row themselves (e.g. to apply a relation_type priority
        tie-break), no heavy recommendation engine involved.
        """
        if not entity_ids:
            return []
        stmt = (
            select(
                RelationshipEdge.relation_type,
                RelationshipEdge.to_entity_id,
                Entity.title,
                func.count(func.distinct(RelationshipEdge.from_entity_id)).label("shared_count"),
            )
            .join(Entity, Entity.id == RelationshipEdge.to_entity_id)
            .where(RelationshipEdge.from_entity_id.in_(entity_ids))
            .group_by(RelationshipEdge.relation_type, RelationshipEdge.to_entity_id, Entity.title)
            .having(func.count(func.distinct(RelationshipEdge.from_entity_id)) >= min_shared)
        )
        result = await self.db.execute(stmt)
        return [(row[0], row[1], row[2], row[3]) for row in result.all()]

    async def find_entities_by_relation(
        self,
        relation_type: str,
        target_id: uuid.UUID,
        exclude_ids: list[uuid.UUID],
        limit: int = 6,
    ) -> list[Entity]:
        """Entities with their own outgoing (relation_type, target_id) edge --
        e.g. other movies directed_by the same person -- excluding entities
        already in the caller's set (e.g. the list's current items)."""
        stmt = (
            select(Entity)
            .join(RelationshipEdge, RelationshipEdge.from_entity_id == Entity.id)
            .where(
                RelationshipEdge.relation_type == relation_type,
                RelationshipEdge.to_entity_id == target_id,
                Entity.id.notin_(exclude_ids),
            )
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def find_similar_by_genre(
        self, entity_id: uuid.UUID, entity_type: str, exclude_ids: list[uuid.UUID], limit: int = 6
    ) -> list[Entity]:
        """Fallback for the /entities/{id}/related endpoint when the
        similar_to graph has too few (or zero) edges for this entity -- a
        smaller/regional title with sparse director/cast data often never
        clears build_similarity_graph.py's >=2-shared-connection bar, which
        left "اگر این را دوست داری..." empty far more often than it should
        be. Same entity_type only, ranked by how many genres are shared
        (most overlap first) then by computed_score."""
        genre_ids = (
            select(RelationshipEdge.to_entity_id)
            .where(
                RelationshipEdge.from_entity_id == entity_id,
                RelationshipEdge.relation_type == "has_genre",
            )
            .scalar_subquery()
        )

        shared_count = func.count(RelationshipEdge.to_entity_id).label("shared_genres")

        stmt = (
            select(Entity, shared_count)
            .join(RelationshipEdge, RelationshipEdge.from_entity_id == Entity.id)
            .outerjoin(EntityRanking, EntityRanking.entity_id == Entity.id)
            .where(
                RelationshipEdge.relation_type == "has_genre",
                RelationshipEdge.to_entity_id.in_(genre_ids),
                Entity.entity_type == entity_type,
                Entity.id != entity_id,
                Entity.id.notin_(exclude_ids),
            )
            .group_by(Entity.id, EntityRanking.computed_score)
            .order_by(shared_count.desc(), EntityRanking.computed_score.desc().nulls_last())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return [row[0] for row in result.all()]

    async def get_related_ids(self, entity_id: uuid.UUID, limit: int = 30) -> list[uuid.UUID]:
        stmt = (
            select(RelationshipEdge.to_entity_id)
            .where(
                RelationshipEdge.from_entity_id == entity_id,
                RelationshipEdge.relation_type.in_(["similar_to", "has_genre"]),
            )
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return [row[0] for row in result.all()]
    
    async def create_entity(self, **kwargs) -> Entity:
        entity = Entity(**kwargs)
        self.db.add(entity)
        await self.db.flush()
        return entity

    async def create_relationship(
        self,
        from_entity_id: uuid.UUID,
        to_entity_id: uuid.UUID,
        relation_type: str,
        edge_metadata: dict | None = None,
        weight: float = 1.0,
        source: str = "sync",
    ) -> None:
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        stmt = pg_insert(RelationshipEdge).values(
            from_entity_id=from_entity_id,
            to_entity_id=to_entity_id,
            relation_type=relation_type,
            edge_metadata=edge_metadata or {},
            weight=weight,
            source=source,
        )
        stmt = stmt.on_conflict_do_nothing(
            index_elements=["from_entity_id", "to_entity_id", "relation_type"]
        )
        await self.db.execute(stmt)
        await self.db.flush()

    async def replace_relationships(
        self,
        from_entity_id: uuid.UUID,
        relation_type: str,
        to_entity_ids: list[uuid.UUID],
        source: str = "sync",
    ) -> None:
        """
        Make from_entity_id's relation_type edges match to_entity_ids exactly:
        creates any missing ones and deletes any existing edge of this
        relation_type pointing somewhere no longer in the list. create_relationship
        alone is additive-only (ON CONFLICT DO NOTHING), so an edge made by a
        sync run whose source data has since changed (e.g. a genre remapping)
        would otherwise never be retracted -- this reconciles it instead of
        leaving it to accumulate stale edges across re-syncs.
        """
        stale_stmt = delete(RelationshipEdge).where(
            RelationshipEdge.from_entity_id == from_entity_id,
            RelationshipEdge.relation_type == relation_type,
        )
        if to_entity_ids:
            stale_stmt = stale_stmt.where(RelationshipEdge.to_entity_id.notin_(to_entity_ids))
        await self.db.execute(stale_stmt)
        for to_entity_id in to_entity_ids:
            await self.create_relationship(from_entity_id, to_entity_id, relation_type, source=source)