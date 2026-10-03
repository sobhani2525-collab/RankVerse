"""
Models for the "daily battle" module: one fixed movie pair per Tehran
calendar day, voted on by everyone (guests included).

  - daily_battles: one row per date; the pair is created lazily by the first
    request of the day (or ahead of time by an admin)
  - daily_battle_votes: one vote per user or per guest per day. The per-side
    counters on daily_battles are denormalized so live percentages are a
    single-row read.
"""
import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DailyBattle(Base):
    __tablename__ = "daily_battles"
    __table_args__ = (
        UniqueConstraint("battle_date", name="uq_daily_battles_battle_date"),
        CheckConstraint("left_id != right_id", name="ck_daily_battles_distinct_items"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    battle_date: Mapped[date] = mapped_column(Date, nullable=False)
    left_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False
    )
    right_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False
    )
    # genre | decade | director | pair: why the two films were matched.
    theme_kind: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pair")
    theme_value: Mapped[str] = mapped_column(String(200), nullable=False, server_default="")
    left_votes: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    right_votes: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    source: Mapped[str] = mapped_column(String(10), nullable=False, server_default="auto")  # auto | admin
    created_by_admin_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class DailyBattleVote(Base):
    __tablename__ = "daily_battle_votes"
    __table_args__ = (
        CheckConstraint(
            "(user_id IS NOT NULL AND guest_id IS NULL) OR (user_id IS NULL AND guest_id IS NOT NULL)",
            name="ck_daily_battle_votes_one_voter",
        ),
        CheckConstraint("choice IN ('left', 'right')", name="ck_daily_battle_votes_choice"),
        Index(
            "uq_daily_battle_votes_user",
            "daily_battle_id", "user_id",
            unique=True,
            postgresql_where=text("user_id IS NOT NULL"),
        ),
        Index(
            "uq_daily_battle_votes_guest",
            "daily_battle_id", "guest_id",
            unique=True,
            postgresql_where=text("guest_id IS NOT NULL"),
        ),
        Index("ix_daily_battle_votes_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    daily_battle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("daily_battles.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    guest_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    choice: Mapped[str] = mapped_column(String(5), nullable=False)  # left | right
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
