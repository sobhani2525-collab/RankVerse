import uuid

from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.entities.models import Entity, RelationshipEdge, EntityRanking


class EntityRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_slug(self, slug: str, entity_type: str | None = None) -> Entity | None:
        stmt = select(Entity).where(Entity.slug == slug)
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
        stmt = select(RelationshipEdge).where(
            RelationshipEdge.from_entity_id == entity_id,
            RelationshipEdge.relation_type == relation_type,
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

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
    ) -> RelationshipEdge:
        edge = RelationshipEdge(
            from_entity_id=from_entity_id,
            to_entity_id=to_entity_id,
            relation_type=relation_type,
            edge_metadata=edge_metadata or {},
        )
        self.db.add(edge)
        await self.db.flush()
        return edge
