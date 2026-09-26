import uuid

from sqlalchemy import and_, bindparam, delete, func, select, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import aliased, contains_eager, joinedload, selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.entities.models import Entity, RelationshipEdge, EntityRanking


class EntityRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_slug(self, slug: str, entity_type: str | None = None) -> Entity | None:
        # joinedload, not selectinload: the one-to-one ranking comes back in
        # the same query instead of costing a second DB round trip.
        stmt = select(Entity).options(joinedload(Entity.ranking)).where(Entity.slug == slug)
        if entity_type:
            stmt = stmt.where(Entity.entity_type == entity_type)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id(self, entity_id: uuid.UUID) -> Entity | None:
        return await self.db.get(Entity, entity_id)

    async def get_by_external_id(
        self, external_source: str, external_id: str, entity_type: str | None = None
    ) -> Entity | None:
        # entity_type matters for source "tmdb": TMDb movie ids and TV ids are
        # separate numbering spaces, so the same external_id can be both a
        # movie and a tv_series.
        stmt = select(Entity).where(
            Entity.external_source == external_source,
            Entity.external_id == external_id,
        )
        if entity_type:
            stmt = stmt.where(Entity.entity_type == entity_type)
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
        stmt = select(Entity).where(Entity.entity_type == entity_type)

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
            stmt = select(Entity).where(
                    Entity.entity_type == entity_type,
                    Entity.id.in_(genre_subq),
            )

        if year_from:
            stmt = stmt.where(Entity.attributes["year"].as_integer() >= year_from)
        if year_to:
            stmt = stmt.where(Entity.attributes["year"].as_integer() <= year_to)

        # The total rides along as an uncorrelated scalar subquery (Postgres
        # evaluates it once), and the ranking comes from the join already
        # needed for ordering -- one round trip instead of count + page +
        # ranking load.
        count_stmt = select(func.count()).select_from(stmt.subquery())
        page_stmt = (
            stmt.outerjoin(EntityRanking, EntityRanking.entity_id == Entity.id)
            .options(contains_eager(Entity.ranking))
            .add_columns(count_stmt.scalar_subquery().label("total"))
        )
        if sort_by == "score":
            page_stmt = page_stmt.order_by(EntityRanking.computed_score.desc().nulls_last())
        elif sort_by == "newest":
            page_stmt = page_stmt.order_by(Entity.created_at.desc())

        page_stmt = page_stmt.offset((page - 1) * page_size).limit(page_size)
        rows = (await self.db.execute(page_stmt)).all()
        if rows:
            return [row[0] for row in rows], rows[0][1]
        # Past the last page there's no row to carry the total.
        return [], (await self.db.execute(count_stmt)).scalar_one()

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

    async def get_relationships_by_type(
        self, entity_id: uuid.UUID, relation_types: list[str]
    ) -> dict[str, list[RelationshipEdge]]:
        """Outgoing edges of several relation types in one round trip (the
        target entity joined in), grouped by type; types with no edges map
        to an empty list."""
        stmt = (
            select(RelationshipEdge)
            .options(joinedload(RelationshipEdge.to_entity))
            .where(
                RelationshipEdge.from_entity_id == entity_id,
                RelationshipEdge.relation_type.in_(relation_types),
            )
        )
        grouped: dict[str, list[RelationshipEdge]] = {t: [] for t in relation_types}
        for edge in (await self.db.execute(stmt)).scalars().all():
            grouped[edge.relation_type].append(edge)
        return grouped

    async def get_incoming_relationships_by_type(
        self, entity_id: uuid.UUID, relation_types: list[str]
    ) -> dict[str, list[RelationshipEdge]]:
        """Incoming counterpart of get_relationships_by_type -- e.g. all of a
        person's credits -- with each source entity and its ranking joined in."""
        stmt = (
            select(RelationshipEdge)
            .options(joinedload(RelationshipEdge.from_entity).joinedload(Entity.ranking))
            .where(
                RelationshipEdge.to_entity_id == entity_id,
                RelationshipEdge.relation_type.in_(relation_types),
            )
        )
        grouped: dict[str, list[RelationshipEdge]] = {t: [] for t in relation_types}
        for edge in (await self.db.execute(stmt)).scalars().all():
            grouped[edge.relation_type].append(edge)
        return grouped

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
            .options(joinedload(RelationshipEdge.to_entity))
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

    async def get_shared_connections_many(
        self, entity_id: uuid.UUID, other_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[tuple[str, str]]]:
        """get_shared_connections for several entities at once: other_id ->
        [(relation_type, shared target's title), ...], one round trip instead
        of one per entity. Entities with nothing shared map to []."""
        shared: dict[uuid.UUID, list[tuple[str, str]]] = {other_id: [] for other_id in other_ids}
        if not other_ids:
            return shared
        own = aliased(RelationshipEdge)
        other = aliased(RelationshipEdge)
        stmt = (
            select(other.from_entity_id, own.relation_type, Entity.title)
            .join(
                other,
                and_(other.to_entity_id == own.to_entity_id, other.relation_type == own.relation_type),
            )
            .join(Entity, Entity.id == own.to_entity_id)
            .where(
                own.from_entity_id == entity_id,
                other.from_entity_id.in_(other_ids),
                own.relation_type.in_(("directed_by", "has_genre", "acted_in")),
            )
        )
        for other_id, relation_type, title in (await self.db.execute(stmt)).all():
            shared[other_id].append((relation_type, title))
        return shared

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

    async def get_or_create_many(
        self,
        entity_type: str,
        rows: list[dict],
        key: str = "external_id",
        external_source: str | None = None,
        fill_missing_key: str | None = None,
    ) -> dict[str, uuid.UUID]:
        """
        Batched find-or-create for small shared entities (people, genres,
        networks): one SELECT, one INSERT ... ON CONFLICT (slug) DO NOTHING
        for whatever's missing, and one re-SELECT if anything was inserted --
        instead of a SELECT (+ INSERT) round trip per row. Each row is a dict
        with title/slug/external_id/external_source. key is what rows are
        matched and returned by: "external_id" (scoped to external_source)
        or "slug" (genres, which are shared across sources by slug).

        ON CONFLICT DO NOTHING also makes this safe against a concurrent
        sync inserting the same row first -- the re-SELECT just finds it.
        Returns {row[key]: entity id}.

        A row may carry "attributes" (used when it's inserted). With
        fill_missing_key, an already-existing row whose attributes lack that
        key gets the row's attributes merged in -- e.g. people created
        before their photo was recorded get it on the next sync that sees
        them. Rows that already have the key are never touched, and the
        UPDATE is skipped entirely when nothing is missing.
        """
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        unique = {r[key]: r for r in rows}
        if not unique:
            return {}

        def lookup(with_fill_flag: bool = False):
            column = Entity.external_id if key == "external_id" else Entity.slug
            columns = [column, Entity.id]
            if with_fill_flag:
                columns.append(Entity.attributes.has_key(fill_missing_key))
            stmt = select(*columns).where(Entity.entity_type == entity_type, column.in_(list(unique)))
            if key == "external_id":
                stmt = stmt.where(Entity.external_source == external_source)
            return stmt

        if fill_missing_key:
            existing = (await self.db.execute(lookup(with_fill_flag=True))).all()
            found = {k: entity_id for k, entity_id, _ in existing}
            to_fill = [
                {"b_id": entity_id, "b_attrs": unique[k]["attributes"]}
                for k, entity_id, has_key in existing
                if not has_key and unique[k].get("attributes")
            ]
            if to_fill:
                table = Entity.__table__
                await self.db.execute(
                    update(table)
                    .where(table.c.id == bindparam("b_id"), ~table.c.attributes.has_key(fill_missing_key))
                    .values(attributes=table.c.attributes.op("||")(bindparam("b_attrs", type_=JSONB))),
                    to_fill,
                )
        else:
            found = dict((await self.db.execute(lookup())).all())
        missing = [r for k, r in unique.items() if k not in found]
        if missing:
            await self.db.execute(
                pg_insert(Entity)
                .values(
                    [
                        {
                            "id": uuid.uuid4(),
                            "entity_type": entity_type,
                            "external_id": r.get("external_id"),
                            "external_source": r.get("external_source"),
                            "title": r["title"],
                            "slug": r["slug"],
                            "attributes": r.get("attributes") or {},
                        }
                        for r in missing
                    ]
                )
                .on_conflict_do_nothing(index_elements=["slug"])
            )
            found = dict((await self.db.execute(lookup())).all())
        return found

    async def create_relationships_bulk(
        self, from_entity_id: uuid.UUID, edges: list[tuple[uuid.UUID, str, dict | None]], source: str = "sync"
    ) -> None:
        """
        create_relationship for many (to_entity_id, relation_type,
        edge_metadata) edges in one INSERT, with the same semantics:
        idempotent, an existing edge is left untouched.
        """
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        if not edges:
            return
        await self.db.execute(
            pg_insert(RelationshipEdge)
            .values(
                [
                    {
                        "id": uuid.uuid4(),
                        "from_entity_id": from_entity_id,
                        "to_entity_id": to_id,
                        "relation_type": relation_type,
                        "edge_metadata": metadata or {},
                        "weight": 1.0,
                        "source": source,
                    }
                    for to_id, relation_type, metadata in edges
                ]
            )
            .on_conflict_do_nothing(index_elements=["from_entity_id", "to_entity_id", "relation_type"])
        )

    async def create_relationship(
        self,
        from_entity_id: uuid.UUID,
        to_entity_id: uuid.UUID,
        relation_type: str,
        edge_metadata: dict | None = None,
        weight: float = 1.0,
        source: str = "sync",
        update_metadata_on_conflict: bool = False,
    ) -> None:
        """
        Idempotent on (from, to, relation_type). By default an existing edge
        is left untouched; update_metadata_on_conflict refreshes its
        edge_metadata instead, for edges whose metadata comes from source
        data that can change between syncs (e.g. a TV director's episode_count).
        """
        from sqlalchemy.dialects.postgresql import insert as pg_insert

        stmt = pg_insert(RelationshipEdge).values(
            from_entity_id=from_entity_id,
            to_entity_id=to_entity_id,
            relation_type=relation_type,
            edge_metadata=edge_metadata or {},
            weight=weight,
            source=source,
        )
        conflict_cols = ["from_entity_id", "to_entity_id", "relation_type"]
        if update_metadata_on_conflict:
            stmt = stmt.on_conflict_do_update(
                index_elements=conflict_cols,
                set_={"edge_metadata": stmt.excluded.edge_metadata},
            )
        else:
            stmt = stmt.on_conflict_do_nothing(index_elements=conflict_cols)
        await self.db.execute(stmt)
        await self.db.flush()

    async def replace_relationships(
        self,
        from_entity_id: uuid.UUID,
        relation_type: str,
        to_entity_ids: list[uuid.UUID],
        source: str = "sync",
        edge_metadata_by_target: dict[uuid.UUID, dict] | None = None,
    ) -> None:
        """
        Make from_entity_id's relation_type edges match to_entity_ids exactly:
        creates any missing ones and deletes any existing edge of this
        relation_type pointing somewhere no longer in the list. create_relationship
        alone is additive-only (ON CONFLICT DO NOTHING), so an edge made by a
        sync run whose source data has since changed (e.g. a genre remapping)
        would otherwise never be retracted -- this reconciles it instead of
        leaving it to accumulate stale edges across re-syncs.

        edge_metadata_by_target, when given, sets each kept edge's metadata
        (refreshed on existing edges too, not only on newly created ones).
        """
        stale_stmt = delete(RelationshipEdge).where(
            RelationshipEdge.from_entity_id == from_entity_id,
            RelationshipEdge.relation_type == relation_type,
        )
        if to_entity_ids:
            stale_stmt = stale_stmt.where(RelationshipEdge.to_entity_id.notin_(to_entity_ids))
        await self.db.execute(stale_stmt)
        for to_entity_id in to_entity_ids:
            if edge_metadata_by_target is None:
                await self.create_relationship(from_entity_id, to_entity_id, relation_type, source=source)
            else:
                await self.create_relationship(
                    from_entity_id, to_entity_id, relation_type,
                    edge_metadata=edge_metadata_by_target.get(to_entity_id),
                    source=source,
                    update_metadata_on_conflict=True,
                )