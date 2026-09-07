"""
Models for the "battles" module (pairwise / Tinder-style ranking).

Two tables:
  - pair_votes: raw log of every A-vs-B vote a user casts
  - entity_elo_scores: current Elo rating per (entity, category), derived
    from pair_votes. Kept separate from the main ranking table so this
    module doesn't need write-access to whatever schema the ranking
    module already owns; the ranking module can just read elo_score
    from here and fold it into computed_score.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

# NOTE: adjust this import to match your project's actual Base location,
# e.g. `from app.core.database import Base`
from app.core.database import Base


class VoteOutcome(str, enum.Enum):
    LEFT = "left"
    RIGHT = "right"
    SKIP = "skip"  # user shown the pair but skipped / no preference


class PairVote(Base):
    """A single pairwise vote cast by a user."""

    __tablename__ = "pair_votes"
    __table_args__ = (
        # A user can revote on the same pair (tastes change / recheck),
        # but not spam the exact same pair repeatedly within the same
        # request lifecycle. We rely on rate limiting in the service
        # layer instead of a hard uniqueness constraint here.
        CheckConstraint("left_item != right_item", name="ck_pair_votes_distinct_items"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(nullable=False, index=True)  # e.g. "movie"
    left_item: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False
    )
    right_item: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False
    )
    winner: Mapped[VoteOutcome] = mapped_column(
        Enum(
            VoteOutcome,
            name="vote_outcome",
            # Without this, SQLAlchemy writes the Python Enum member's
            # NAME ("LEFT") instead of its value ("left") to the DB,
            # which doesn't match the lowercase Postgres enum labels.
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )

    # Elo snapshot at the moment of the vote — useful for later analysis
    # of algorithm quality / detecting rating drift, and for reproducing
    # historical leaderboards.
    left_score_before: Mapped[float] = mapped_column(Float, nullable=False, default=1200.0)
    right_score_before: Mapped[float] = mapped_column(Float, nullable=False, default=1200.0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    user = relationship("User", lazy="noload")


class EntityEloScore(Base):
    """Current Elo rating for one entity within one category."""

    __tablename__ = "entity_elo_scores"
    __table_args__ = (
        UniqueConstraint("entity_id", "category", name="uq_entity_elo_entity_category"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(nullable=False, index=True)
    elo_score: Mapped[float] = mapped_column(Float, nullable=False, default=1200.0)
    matches_played: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
