import uuid

from sqlalchemy import select, func
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
    ) -> tuple[list[Entity], int]:
        stmt = select(Entity).options(selectinload(Entity.ranking)).where(Entity.entity_type == "movie")

        if genre_slug:
            # Filter movies that have a has_genre edge pointing to the genre entity with this slug
            genre_subq = (
                select(RelationshipEdge.from_entity_id)
                .join(Entity, Entity.id == RelationshipEdge.to_entity_id)
                .where(
                    RelationshipEdge.relation_type == "has_genre",
                    Entity.slug == genre_slug,
                )
            )
            stmt = select(Entity).options(selectinload(Entity.ranking)).where(
                    Entity.entity_type == "movie",
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