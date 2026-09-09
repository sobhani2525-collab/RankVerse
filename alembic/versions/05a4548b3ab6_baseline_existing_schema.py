"""baseline existing schema

Revision ID: 05a4548b3ab6
Revises:
Create Date: 2026-09-05 18:36:09.244492

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID
from pgvector.sqlalchemy import Vector


revision: str = '05a4548b3ab6'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("username", sa.String(100), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "entities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("external_id", sa.String(100), nullable=True),
        sa.Column("external_source", sa.String(50), nullable=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("slug", sa.String(500), nullable=False, unique=True),
        sa.Column("attributes", JSONB(), nullable=False, server_default="{}"),
        sa.Column("embedding", Vector(384), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_entities_entity_type", "entities", ["entity_type"])
    op.create_index("ix_entities_slug", "entities", ["slug"])
    op.create_index(
        "ix_entities_embedding", "entities",
        ["embedding"], postgresql_using="ivfflat",
        postgresql_with={"lists": "100"}, postgresql_ops={"embedding": "vector_cosine_ops"},
    )

    op.create_table(
        "relationships",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("from_entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("to_entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("relation_type", sa.String(50), nullable=False),
        sa.Column("edge_metadata", JSONB(), nullable=False, server_default="{}"),
        sa.Column("weight", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("source", sa.String(20), nullable=False, server_default="sync"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("from_entity_id", "to_entity_id", "relation_type", name="uq_relationship_pair_type"),
    )
    op.create_index("ix_relationships_from_entity_id", "relationships", ["from_entity_id"])
    op.create_index("ix_relationships_to_entity_id", "relationships", ["to_entity_id"])
    op.create_index("ix_relationships_relation_type", "relationships", ["relation_type"])
    op.create_index("ix_relationships_type_weight", "relationships", ["relation_type", "weight"])

    op.create_table(
        "entity_rankings",
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("avg_user_score", sa.Float(), nullable=True),
        sa.Column("total_votes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("external_score", sa.Float(), nullable=True),
        sa.Column("computed_score", sa.Float(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_entity_rankings_computed_score", "entity_rankings", ["computed_score"])

    op.create_table(
        "user_ratings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("score", sa.SmallInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "entity_id", name="uq_user_entity_rating"),
        sa.CheckConstraint("score >= 1 AND score <= 10", name="ck_rating_range"),
    )
    op.create_index("ix_user_ratings_user_id", "user_ratings", ["user_id"])
    op.create_index("ix_user_ratings_entity_id", "user_ratings", ["entity_id"])


def downgrade() -> None:
    op.drop_table("user_ratings")
    op.drop_table("entity_rankings")
    op.drop_index("ix_relationships_type_weight", table_name="relationships")
    op.drop_index("ix_relationships_relation_type", table_name="relationships")
    op.drop_index("ix_relationships_to_entity_id", table_name="relationships")
    op.drop_index("ix_relationships_from_entity_id", table_name="relationships")
    op.drop_table("relationships")
    op.drop_index("ix_entities_embedding", table_name="entities")
    op.drop_index("ix_entities_slug", table_name="entities")
    op.drop_index("ix_entities_entity_type", table_name="entities")
    op.drop_table("entities")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
