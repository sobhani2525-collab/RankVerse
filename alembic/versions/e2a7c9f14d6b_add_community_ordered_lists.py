"""add community-ordered lists + item contribution/likes

Revision ID: e2a7c9f14d6b
Revises: c1a9e4f2b7d3
Create Date: 2026-09-14

Adds list_type/contribution_mode to user_lists, added_by_user_id/like_score
to user_list_items (added_by_user_id backfilled from user_lists.user_id for
existing rows), and a new list_item_likes table for per-item like/dislike
votes (kept separate from list_likes, which likes the whole list).

Self-healing like 05986df9sdo27_add_battles_tables: drops any leftover
objects from a previous partial run before recreating them.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "e2a7c9f14d6b"
down_revision = "c1a9e4f2b7d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    bind.execute(sa.text("DROP TABLE IF EXISTS list_item_likes CASCADE"))
    bind.execute(sa.text("ALTER TABLE user_lists DROP COLUMN IF EXISTS list_type"))
    bind.execute(sa.text("ALTER TABLE user_lists DROP COLUMN IF EXISTS contribution_mode"))
    bind.execute(sa.text("ALTER TABLE user_list_items DROP COLUMN IF EXISTS added_by_user_id"))
    bind.execute(sa.text("ALTER TABLE user_list_items DROP COLUMN IF EXISTS like_score"))
    bind.execute(sa.text("DROP TYPE IF EXISTS list_type"))
    bind.execute(sa.text("DROP TYPE IF EXISTS list_contribution_mode"))

    bind.execute(sa.text("CREATE TYPE list_type AS ENUM ('ranked', 'community_ordered')"))
    bind.execute(
        sa.text(
            "CREATE TYPE list_contribution_mode AS ENUM "
            "('owner_only', 'anyone', 'followers_only')"
        )
    )
    list_type_enum = postgresql.ENUM(
        "ranked", "community_ordered", name="list_type", create_type=False
    )
    contribution_mode_enum = postgresql.ENUM(
        "owner_only", "anyone", "followers_only", name="list_contribution_mode", create_type=False
    )

    op.add_column(
        "user_lists",
        sa.Column(
            "list_type", list_type_enum, nullable=False, server_default="ranked"
        ),
    )
    op.add_column(
        "user_lists",
        sa.Column(
            "contribution_mode", contribution_mode_enum, nullable=False, server_default="owner_only"
        ),
    )

    op.add_column(
        "user_list_items",
        sa.Column("added_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "user_list_items",
        sa.Column("like_score", sa.Float(), nullable=True),
    )

    # Backfill: whoever created the list is the item's "added by" until
    # this migration ships collaborative contribution.
    bind.execute(
        sa.text(
            """
            UPDATE user_list_items
            SET added_by_user_id = user_lists.user_id
            FROM user_lists
            WHERE user_list_items.list_id = user_lists.id
              AND user_list_items.added_by_user_id IS NULL
            """
        )
    )
    op.alter_column("user_list_items", "added_by_user_id", nullable=False)
    op.create_foreign_key(
        "fk_user_list_items_added_by_user_id",
        "user_list_items",
        "users",
        ["added_by_user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_user_list_items_added_by_user_id", "user_list_items", ["added_by_user_id"]
    )

    op.create_table(
        "list_item_likes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "list_item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("user_list_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("is_like", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("list_item_id", "user_id", name="uq_list_item_like_once"),
    )
    op.create_index("ix_list_item_likes_list_item_id", "list_item_likes", ["list_item_id"])
    op.create_index("ix_list_item_likes_user_id", "list_item_likes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_list_item_likes_user_id", table_name="list_item_likes")
    op.drop_index("ix_list_item_likes_list_item_id", table_name="list_item_likes")
    op.drop_table("list_item_likes")

    op.drop_index("ix_user_list_items_added_by_user_id", table_name="user_list_items")
    op.drop_constraint(
        "fk_user_list_items_added_by_user_id", "user_list_items", type_="foreignkey"
    )
    op.drop_column("user_list_items", "like_score")
    op.drop_column("user_list_items", "added_by_user_id")

    op.drop_column("user_lists", "contribution_mode")
    op.drop_column("user_lists", "list_type")

    op.get_bind().execute(sa.text("DROP TYPE IF EXISTS list_contribution_mode"))
    op.get_bind().execute(sa.text("DROP TYPE IF EXISTS list_type"))
