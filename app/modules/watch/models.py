import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WatchLink(Base):
    """Where a movie or series can be watched: one link per (title, provider)."""

    __tablename__ = "watch_links"
    __table_args__ = (
        UniqueConstraint("entity_id", "provider", name="uq_watch_link_entity_provider"),
        Index("ix_watch_links_provider", "provider"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), index=True, nullable=False
    )
    provider: Mapped[str] = mapped_column(String(30), nullable=False)  # a key of providers.PROVIDERS
    url: Mapped[str] = mapped_column(String(1000), nullable=False)
    access_type: Mapped[str] = mapped_column(String(20), server_default="subscription", nullable=False)
    # A tracked partner/affiliate link; the page labels these as such.
    is_affiliate: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    # Where the row came from: "manual" (admin form), "import" (CSV), later "feed".
    source: Mapped[str] = mapped_column(String(20), server_default="manual", nullable=False)
    click_count: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
