import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

SEVERITIES = ("info", "warning", "critical")


class AdminAlert(Base):
    """Operational alert for admins (separate from user notifications)."""

    __tablename__ = "admin_alerts"
    __table_args__ = (
        # At most one open (unresolved) row per fingerprint: repeats bump `occurrences`.
        Index(
            "uq_admin_alerts_open_fingerprint",
            "fingerprint",
            unique=True,
            postgresql_where=text("resolved_at IS NULL"),
        ),
        Index("ix_admin_alerts_status_seen", "resolved_at", text("last_seen_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)
    source: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    details: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(200), nullable=False)
    occurrences: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admin_accounts.id", ondelete="SET NULL"), nullable=True
    )
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
