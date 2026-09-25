import enum
import uuid
from app.modules.entities.models import Entity
from app.modules.users.models import User
from datetime import datetime

from sqlalchemy import (
    String, Text, Boolean, Integer, Float, ForeignKey, DateTime, Enum, func,
    UniqueConstraint, Index, text
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ListType(str, enum.Enum):
    RANKED = "ranked"
    COMMUNITY_ORDERED = "community_ordered"


class ContributionMode(str, enum.Enum):
    OWNER_ONLY = "owner_only"
    ANYONE = "anyone"
    FOLLOWERS_ONLY = "followers_only"


class UserList(Base):
    __tablename__ = "user_lists"
    __table_args__ = (
        Index("ix_user_lists_user_visibility", "user_id", "visibility"),
        Index("ix_user_lists_entity_type", "entity_type"),
        # Partial unique index: at most one "will watch" system list per user.
        Index(
            "uq_user_lists_one_watch_later",
            "user_id",
            unique=True,
            postgresql_where=text("is_watch_later"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(220), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_ranked: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    visibility: Mapped[str] = mapped_column(String(20), default="public", nullable=False)
    cover_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    # The one system "تماشا خواهم کرد" (will-watch) list every user gets --
    # private, owner-only, created lazily on first bookmark toggle. See
    # ListService.get_or_create_watch_later_list.
    is_watch_later: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)

    list_type: Mapped[ListType] = mapped_column(
        Enum(
            ListType,
            name="list_type",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        default=ListType.RANKED,
        server_default=ListType.RANKED.value,
        nullable=False,
    )
    contribution_mode: Mapped[ContributionMode] = mapped_column(
        Enum(
            ContributionMode,
            name="list_contribution_mode",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        default=ContributionMode.OWNER_ONLY,
        server_default=ContributionMode.OWNER_ONLY.value,
        nullable=False,
    )

    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    like_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    comment_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    follower_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    items: Mapped[list["UserListItem"]] = relationship(
        back_populates="list", cascade="all, delete-orphan", order_by="UserListItem.position"
    )

    # lazy="raise" on purpose: nothing should lazy-load this in an async
    # session (that raises MissingGreenlet anyway) -- callers that need the
    # owner's username must eager-load it explicitly (see
    # ListRepository.discover, the only caller today).
    owner: Mapped["User"] = relationship("User", foreign_keys=[user_id], lazy="raise")


class UserListItem(Base):
    __tablename__ = "user_list_items"
    __table_args__ = (
        UniqueConstraint("list_id", "entity_id", name="uq_list_entity_once"),
        Index("ix_list_items_list_position", "list_id", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_lists.id", ondelete="CASCADE"), index=True, nullable=False
    )
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), index=True, nullable=False
    )
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)

    added_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )

    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Cached Bayesian-average score for community_ordered lists (see
    # app/modules/lists/scoring.py). Null until the first vote is cast.
    like_score: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    list: Mapped["UserList"] = relationship(back_populates="items")
    entity: Mapped["Entity"] = relationship()


class ListLike(Base):
    __tablename__ = "list_likes"
    __table_args__ = (UniqueConstraint("list_id", "user_id", name="uq_list_like_once"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_lists.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ListFollow(Base):
    __tablename__ = "list_follows"
    __table_args__ = (UniqueConstraint("list_id", "user_id", name="uq_list_follow_once"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_lists.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ListItemLike(Base):
    __tablename__ = "list_item_likes"
    __table_args__ = (UniqueConstraint("list_item_id", "user_id", name="uq_list_item_like_once"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    list_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_list_items.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    is_like: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ListComment(Base):
    __tablename__ = "list_comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user_lists.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    parent_comment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("list_comments.id", ondelete="CASCADE"), nullable=True
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())