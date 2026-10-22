"""
Models for tournament battles (user-made brackets of 4/8/16 entities).

The older pairwise Elo battles (models.py) and the daily battle are separate
features; these tables only share the "battle" name.

  - battles: one bracket (draft -> active -> completed, or archived)
  - battle_participants: the entrants and their seeds
  - battle_matches: every match of every round, created at publish time
  - battle_votes: one (changeable) vote per user per match
  - battle_follows: users following a battle
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
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
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

VISIBILITIES = ("draft", "unlisted", "public")
STATUSES = ("draft", "active", "completed", "archived")
MATCH_STATUSES = ("pending", "open", "closed")


class Battle(Base):
    __tablename__ = "battles"
    __table_args__ = (
        CheckConstraint("bracket_size IN (4, 8, 16)", name="ck_battles_bracket_size"),
        CheckConstraint("visibility IN ('draft', 'unlisted', 'public')", name="ck_battles_visibility"),
        CheckConstraint("status IN ('draft', 'active', 'completed', 'archived')", name="ck_battles_status"),
        CheckConstraint("mode IN ('tournament', 'pool')", name="ck_battles_mode"),
        Index("ix_battles_creator", "creator_id", "status"),
        Index("ix_battles_public_listing", "visibility", "status", "created_at"),
        Index("ix_battles_active_due", "status", "current_round"),
        Index("ix_battles_featured", "is_featured", "featured_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(8), nullable=False, unique=True)
    # NULL for official (admin) battles, and once the creator's account is gone.
    creator_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # "pool": a custom "winner stays" pool anyone can play through (the live format);
    # "tournament": elimination bracket with rounds (parked, hidden from the UI).
    mode: Mapped[str] = mapped_column(String(10), nullable=False, server_default="tournament", default="tournament")
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    bracket_size: Mapped[int] = mapped_column(Integer, nullable=False)
    visibility: Mapped[str] = mapped_column(String(10), nullable=False, server_default="draft", default="draft")
    status: Mapped[str] = mapped_column(String(10), nullable=False, server_default="draft", default="draft")
    is_official: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False)
    # NULL = the creator closes each round by hand.
    round_duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    current_round: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    winner_entity_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="SET NULL"), nullable=True
    )
    # Stored so a random seeding can be reproduced; NULL = creator's order.
    seed_value: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # Admin curation (see app/modules/battles/admin_*.py), same idea as featured lists: featured
    # battles are pinned in order (one of them plays on the home page); hidden ones stay reachable
    # by link and for their creator but leave every listing.
    is_featured: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False)
    featured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    featured_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_hidden_from_discovery: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False)
    curation_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    curated_by_admin_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class BattleParticipant(Base):
    __tablename__ = "battle_participants"
    __table_args__ = (
        UniqueConstraint("battle_id", "seed", name="uq_battle_participants_seed"),
        Index("ix_battle_participants_entity", "entity_id"),
    )

    battle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("battles.id", ondelete="CASCADE"), primary_key=True
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), primary_key=True
    )
    # 1-based. In a draft this is just the creator's order; publish may reshuffle it.
    seed: Mapped[int] = mapped_column(Integer, nullable=False)


class BattleMatch(Base):
    __tablename__ = "battle_matches"
    __table_args__ = (
        UniqueConstraint("battle_id", "round", "position", name="uq_battle_matches_slot"),
        CheckConstraint("status IN ('pending', 'open', 'closed')", name="ck_battle_matches_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    battle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("battles.id", ondelete="CASCADE"), nullable=False
    )
    round: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-based
    position: Mapped[int] = mapped_column(Integer, nullable=False)  # 0-based within the round
    entity_a_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=True
    )
    entity_b_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=True
    )
    winner_entity_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="SET NULL"), nullable=True
    )
    opens_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False, server_default="pending", default="pending")
    # Elo points this match moved each side by (see tournament_score); NULL = not scored yet.
    score_delta_a: Mapped[float | None] = mapped_column(Float, nullable=True)
    score_delta_b: Mapped[float | None] = mapped_column(Float, nullable=True)


class BattleVote(Base):
    __tablename__ = "battle_votes"
    __table_args__ = (UniqueConstraint("match_id", "user_id", name="uq_battle_votes_match_user"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("battle_matches.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chosen_entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class BattleFollow(Base):
    __tablename__ = "battle_follows"

    battle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("battles.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class BattlePick(Base):
    """One head-to-head choice a user made while playing a pool battle. The pair is
    stored unordered (entity_lo < entity_hi by id), so playing the same pair again
    changes the choice instead of adding a vote."""

    __tablename__ = "battle_picks"
    __table_args__ = (
        UniqueConstraint("battle_id", "user_id", "entity_lo", "entity_hi", name="uq_battle_picks_pair"),
        Index("ix_battle_picks_battle", "battle_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    battle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("battles.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entity_lo: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False
    )
    entity_hi: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False
    )
    winner_entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False
    )
    # Elo points this pick moved each side by (see pool.record_pick); 0 when it had no effect.
    delta_lo: Mapped[float] = mapped_column(Float, nullable=False, server_default="0", default=0.0)
    delta_hi: Mapped[float] = mapped_column(Float, nullable=False, server_default="0", default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
