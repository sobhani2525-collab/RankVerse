"""add user_list_slug_history and move list slugs to Persian

Revision ID: d4f1a8c3b2e7
Revises: c2d6ef80ee98
Create Date: 2026-10-01

Lists used to get unidecode-style slugs («bhtryn-fylm-hy-nwln»). They now
carry the Persian title. Every list whose slug changes keeps its old slug in
user_list_slug_history so existing links keep resolving (the frontend
308-redirects them to the new slug).
"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from app.core.slug import persian_slugify

# revision identifiers, used by Alembic.
revision = "d4f1a8c3b2e7"
down_revision = "c2d6ef80ee98"
branch_labels = None
depends_on = None

# Frozen copy: mirrors RESERVED_LIST_SLUGS in lists/service.py at this point.
_RESERVED = {"new"}
_TEMP_PREFIX = "__migrating__"


def _plan_slugs(rows) -> dict[uuid.UUID, str]:
    """rows: (id, title, slug) ordered by created_at, id. Returns the lists
    whose slug changes -> their new slug.

    A new slug must not collide with another list's new slug, another
    list's current slug (which stays reachable as a redirect, or simply
    stays in use if that list is unchanged) or a reserved slug."""
    all_current = {slug for _, _, slug in rows}
    taken_new: set[str] = set()
    changes: dict[uuid.UUID, str] = {}
    for list_id, title, current in rows:
        base = persian_slugify(title, max_length=200)
        candidate, suffix = base, 1
        while (
            candidate in taken_new
            or candidate in _RESERVED
            or (candidate != current and candidate in all_current)
        ):
            suffix += 1
            candidate = f"{base}-{suffix}"
        taken_new.add(candidate)
        if candidate != current:
            changes[list_id] = candidate
    return changes


def upgrade() -> None:
    op.create_table(
        "user_list_slug_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("list_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("slug", sa.String(length=220), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["list_id"], ["user_lists.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_list_slug_history_list_id", "user_list_slug_history", ["list_id"])
    op.create_index("ix_user_list_slug_history_slug", "user_list_slug_history", ["slug"], unique=True)

    conn = op.get_bind()
    rows = conn.execute(
        sa.text("SELECT id, title, slug FROM user_lists ORDER BY created_at, id")
    ).all()
    changes = _plan_slugs(rows)
    old_slugs = {list_id: slug for list_id, _, slug in rows}

    # Loop 1: park the old slug in history and free the unique slug index.
    for list_id in changes:
        conn.execute(
            sa.text(
                "INSERT INTO user_list_slug_history (id, list_id, slug) "
                "VALUES (gen_random_uuid(), :list_id, :slug)"
            ),
            {"list_id": list_id, "slug": old_slugs[list_id]},
        )
        conn.execute(
            sa.text("UPDATE user_lists SET slug = :tmp WHERE id = :id"),
            {"tmp": f"{_TEMP_PREFIX}{list_id}", "id": list_id},
        )
    # Loop 2: final slugs (no mid-way unique conflicts possible now).
    for list_id, new_slug in changes.items():
        conn.execute(
            sa.text("UPDATE user_lists SET slug = :slug WHERE id = :id"),
            {"slug": new_slug, "id": list_id},
        )


def downgrade() -> None:
    conn = op.get_bind()
    oldest = conn.execute(
        sa.text(
            "SELECT DISTINCT ON (list_id) list_id, slug FROM user_list_slug_history "
            "ORDER BY list_id, created_at, id"
        )
    ).all()
    for list_id, _ in oldest:
        conn.execute(
            sa.text("UPDATE user_lists SET slug = :tmp WHERE id = :id"),
            {"tmp": f"{_TEMP_PREFIX}{list_id}", "id": list_id},
        )
    for list_id, slug in oldest:
        conn.execute(
            sa.text("UPDATE user_lists SET slug = :slug WHERE id = :id"),
            {"slug": slug, "id": list_id},
        )

    op.drop_index("ix_user_list_slug_history_slug", table_name="user_list_slug_history")
    op.drop_index("ix_user_list_slug_history_list_id", table_name="user_list_slug_history")
    op.drop_table("user_list_slug_history")
