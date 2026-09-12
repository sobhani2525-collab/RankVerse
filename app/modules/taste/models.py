"""
Models for the "taste" module (Taste DNA).

This is a derived data layer, not a source of truth: every table here is
populated by a background job that reads from votes/battles/relationships
elsewhere in the schema and recomputes these rows. Nothing outside that
job should write to these tables directly.

Five tables:
  - user_taste_snapshots: headline label + confidence for a user's taste
    profile, one row per (user, entity_scope) computation.
  - user_taste_dimensions: per-user scores along free-form dimensions
    (genre/mood/era/theme/...), one row per (user, dimension_type, dimension_key).
  - user_taste_anchors: entities that most strongly define a user's taste,
    ranked, one row per (user, entity).
  - user_taste_insights: human-readable, taggable blurbs generated from the
    other tables; can go stale as new data comes in.
  - user_contribution_stats: rollup of how much signal a user has
    contributed (votes/battles/comments/relationships), one row per user.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserTasteSnapshot(Base):
    __tablename__ = "user_taste_snapshots"
    __table_args__ = (
        CheckConstraint("model_confidence >= 0 AND model_confidence <= 1", name="ck_taste_snapshot_confidence_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    model_confidence: Mapped[float] = mapped_column(Float, nullable=False)
    entity_scope: Mapped[str] = mapped_column(String(30), default="movie", nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    model_version: Mapped[str] = mapped_column(String(20), nullable=False)


class UserTasteDimension(Base):
    __tablename__ = "user_taste_dimensions"
    __table_args__ = (
        UniqueConstraint("user_id", "dimension_type", "dimension_key", name="uq_taste_dimension_user_type_key"),
        Index("ix_taste_dimensions_user_confidence", "user_id", "confidence"),
        CheckConstraint("score >= 0 AND score <= 100", name="ck_taste_dimension_score_range"),
        CheckConstraint("confidence >= 0 AND confidence <= 1", name="ck_taste_dimension_confidence_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    dimension_type: Mapped[str] = mapped_column(String(30), nullable=False)
    dimension_key: Mapped[str] = mapped_column(String(60), nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    sample_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class UserTasteAnchor(Base):
    __tablename__ = "user_taste_anchors"
    __table_args__ = (
        UniqueConstraint("user_id", "entity_id", name="uq_taste_anchor_user_entity"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), index=True, nullable=False
    )
    anchor_strength: Mapped[str] = mapped_column(String(20), nullable=False)
    match_score: Mapped[float] = mapped_column(Float, nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserTasteInsight(Base):
    __tablename__ = "user_taste_insights"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    insight_text: Mapped[str] = mapped_column(Text, nullable=False)
    insight_tags: Mapped[list] = mapped_column(JSONB, default=list)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    stale: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class UserContributionStats(Base):
    __tablename__ = "user_contribution_stats"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    votes_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    battles_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    comments_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    contribution_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
