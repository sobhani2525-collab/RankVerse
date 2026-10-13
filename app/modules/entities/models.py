import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String, Text, DateTime, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from pgvector.sqlalchemy import Vector


class Entity(Base):
    """
    Generic node of the knowledge graph.
    entity_type distinguishes movie / person / genre / country / (future: book, album...)
    """
    __tablename__ = "entities"
    __table_args__ = (
        Index("ix_entities_external_source_external_id", "external_source", "external_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    external_source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    slug: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    attributes: Mapped[dict] = mapped_column(JSONB, default=dict)
    
    embedding: Mapped[list[float] | None] = mapped_column(Vector(384), nullable=True, deferred=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    ranking: Mapped["EntityRanking"] = relationship(back_populates="entity", uselist=False)


class RelationshipEdge(Base):
    """Edge of the knowledge graph: e.g. movie --directed_by--> person."""
    __tablename__ = "relationships"
    __table_args__ = (
        UniqueConstraint("from_entity_id", "to_entity_id", "relation_type", name="uq_relationship_pair_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), index=True
    )
    to_entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), index=True
    )
    relation_type: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    edge_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)
    weight: Mapped[float] = mapped_column(default=1.0)
    source: Mapped[str] = mapped_column(String(20), default="sync")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    from_entity: Mapped["Entity"] = relationship(foreign_keys=[from_entity_id])
    to_entity: Mapped["Entity"] = relationship(foreign_keys=[to_entity_id])


class EntityRanking(Base):
    """Denormalized, precomputed ranking score for fast reads."""
    __tablename__ = "entity_rankings"

    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), primary_key=True
    )
    avg_user_score: Mapped[float | None] = mapped_column(nullable=True)
    total_votes: Mapped[int] = mapped_column(default=0)
    external_score: Mapped[float | None] = mapped_column(nullable=True)
    computed_score: Mapped[float | None] = mapped_column(nullable=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    entity: Mapped["Entity"] = relationship(back_populates="ranking")


class PersonStats(Base):
    """Precomputed credit totals per (person, role, origin) for the people
    ranking, so list_people reads an index instead of aggregating every credit
    edge. Rebuilt by app/modules/entities/person_stats.py (see
    scripts/refresh_person_stats.py)."""
    __tablename__ = "person_stats"
    __table_args__ = (
        Index("ix_person_stats_works", "role", "origin", text("works DESC"), "person_id"),
        Index(
            "ix_person_stats_shrunk", "role", "origin", text("shrunk DESC"), "person_id",
            postgresql_where=text("scored >= 3"),
        ),
    )

    person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(20), primary_key=True)    # all | director | actor | creator
    origin: Mapped[str] = mapped_column(String(20), primary_key=True)  # all | persian | foreign
    works: Mapped[int] = mapped_column(Integer, nullable=False)
    scored: Mapped[int] = mapped_column(Integer, nullable=False)       # credited titles that have a score
    avg_score: Mapped[float | None] = mapped_column(nullable=True)
    shrunk: Mapped[float | None] = mapped_column(nullable=True)        # Bayesian-shrunk mean, for sort=score
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class EntityComment(Base):
    """A user comment on an entity page (currently the person page)."""
    __tablename__ = "entity_comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
