import uuid
from sqlalchemy import (
    Column, String, Text, Boolean, Integer, ForeignKey,
    UniqueConstraint, Index, DateTime, func
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.db.base import Base  # مسیر رو با پروژه‌تون تطبیق بدید


class UserList(Base):
    __tablename__ = "user_lists"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    title = Column(String(200), nullable=False)
    slug = Column(String(220), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)

    # اگه لیست فقط یک نوع entity داره (مثلا movie) ست میشه؛ null یعنی mixed list
    entity_type = Column(String(50), nullable=True)
    is_ranked = Column(Boolean, nullable=False, default=True)
    visibility = Column(String(20), nullable=False, default="public")  # public | unlisted | private
    cover_image_url = Column(String(500), nullable=True)
    tags = Column(JSONB, nullable=False, default=list)  # ["action", "90s", "underrated"]

    # denormalized counters — از طریق service layer آپدیت میشن، نه مستقیم از کلاینت
    view_count = Column(Integer, nullable=False, default=0)
    like_count = Column(Integer, nullable=False, default=0)
    comment_count = Column(Integer, nullable=False, default=0)
    follower_count = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    owner = relationship("User", back_populates="lists")
    items = relationship(
        "UserListItem",
        back_populates="list",
        cascade="all, delete-orphan",
        order_by="UserListItem.position",
    )
    likes = relationship("ListLike", back_populates="list", cascade="all, delete-orphan")
    followers = relationship("ListFollow", back_populates="list", cascade="all, delete-orphan")
    comments = relationship("ListComment", back_populates="list", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_user_lists_user_visibility", "user_id", "visibility"),
        Index("ix_user_lists_entity_type", "entity_type"),
    )


class UserListItem(Base):
    __tablename__ = "user_list_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    list_id = Column(UUID(as_uuid=True), ForeignKey("user_lists.id", ondelete="CASCADE"), nullable=False, index=True)
    entity_id = Column(UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False)  # برای فیلتر سریع بدون join

    position = Column(Integer, nullable=False, default=0)
    note = Column(Text, nullable=True)  # توضیح کاربر برای این آیتم خاص
    added_at = Column(DateTime(timezone=True), server_default=func.now())

    list = relationship("UserList", back_populates="items")
    entity = relationship("Entity")

    __table_args__ = (
        UniqueConstraint("list_id", "entity_id", name="uq_list_entity_once"),
        Index("ix_list_items_list_position", "list_id", "position"),
    )


class ListLike(Base):
    __tablename__ = "list_likes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    list_id = Column(UUID(as_uuid=True), ForeignKey("user_lists.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    list = relationship("UserList", back_populates="likes")

    __table_args__ = (UniqueConstraint("list_id", "user_id", name="uq_list_like_once"),)


class ListFollow(Base):
    __tablename__ = "list_follows"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    list_id = Column(UUID(as_uuid=True), ForeignKey("user_lists.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    list = relationship("UserList", back_populates="followers")

    __table_args__ = (UniqueConstraint("list_id", "user_id", name="uq_list_follow_once"),)


class ListComment(Base):
    __tablename__ = "list_comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    list_id = Column(UUID(as_uuid=True), ForeignKey("user_lists.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    parent_comment_id = Column(UUID(as_uuid=True), ForeignKey("list_comments.id", ondelete="CASCADE"), nullable=True)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    list = relationship("UserList", back_populates="comments")
