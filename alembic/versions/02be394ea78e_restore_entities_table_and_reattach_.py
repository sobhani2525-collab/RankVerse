"""restore entities table and reattach foreign keys

Revision ID: 02be394ea78e
Revises: 05986df9sdo27_add_battles_tables
Create Date: 2026-09-07 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID
from pgvector.sqlalchemy import Vector


revision: str = '02be394ea78e'
down_revision: Union[str, None] = '05986df9sdo27_add_battles_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"")

    inspector = sa.inspect(op.get_bind())
    if "entities" in inspector.get_table_names():
        # The baseline migration (05a4548b3ab6) now creates `entities`,
        # its foreign keys, and the relationships.weight/source columns
        # for every fresh database, so there's nothing left to recover
        # here. This branch only runs when replaying history against the
        # one production database where `entities` was actually dropped
        # after 806336d33ba8 and 05986df9sdo27 had already been applied.
        return

    # 0) wipe orphaned rows FIRST — these reference entity ids from before
    #    the entities table was accidentally dropped, and would block the
    #    foreign keys we're about to reattach below
    op.execute("TRUNCATE TABLE entity_rankings, entity_elo_scores, relationships, user_ratings, user_list_items, pair_votes CASCADE")

    # 1) recreate entities table exactly matching app/modules/entities/models.py
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
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_entities_entity_type", "entities", ["entity_type"])
    op.create_index("ix_entities_slug", "entities", ["slug"])
    op.create_index(
        "ix_entities_embedding", "entities",
        ["embedding"], postgresql_using="ivfflat",
        postgresql_with={"lists": "100"}, postgresql_ops={"embedding": "vector_cosine_ops"},
    )

    # 2) reattach every foreign key that pointed to the old entities table
    op.create_foreign_key(
        "fk_entity_rankings_entity_id", "entity_rankings", "entities",
        ["entity_id"], ["id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_entity_elo_scores_entity_id", "entity_elo_scores", "entities",
        ["entity_id"], ["id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_relationships_from_entity_id", "relationships", "entities",
        ["from_entity_id"], ["id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_relationships_to_entity_id", "relationships", "entities",
        ["to_entity_id"], ["id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_user_ratings_entity_id", "user_ratings", "entities",
        ["entity_id"], ["id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_user_list_items_entity_id", "user_list_items", "entities",
        ["entity_id"], ["id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_pair_votes_left_item", "pair_votes", "entities",
        ["left_item"], ["id"], ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_pair_votes_right_item", "pair_votes", "entities",
        ["right_item"], ["id"], ondelete="CASCADE",
    )

    

    # 4) weighted/scored relationship edges (for 'similar_to' style edges)
    op.add_column("relationships", sa.Column("weight", sa.Float(), nullable=False, server_default="1.0"))
    op.add_column("relationships", sa.Column("source", sa.String(20), nullable=False, server_default="sync"))
    op.create_index("ix_relationships_type_weight", "relationships", ["relation_type", "weight"])
    op.create_unique_constraint(
        "uq_relationship_pair_type", "relationships",
        ["from_entity_id", "to_entity_id", "relation_type"],
    )


def downgrade():
    inspector = sa.inspect(op.get_bind())
    existing_fks = {fk["name"] for fk in inspector.get_foreign_keys("entity_rankings")}
    if "fk_entity_rankings_entity_id" not in existing_fks:
        # upgrade() was a no-op on this database (entities already existed
        # via the baseline migration), so there's nothing here to reverse.
        return

    op.drop_constraint("uq_relationship_pair_type", "relationships", type_="unique")
    op.drop_index("ix_relationships_type_weight", table_name="relationships")
    op.drop_column("relationships", "source")
    op.drop_column("relationships", "weight")
    op.drop_constraint("fk_pair_votes_right_item", "pair_votes", type_="foreignkey")
    op.drop_constraint("fk_pair_votes_left_item", "pair_votes", type_="foreignkey")
    op.drop_constraint("fk_user_list_items_entity_id", "user_list_items", type_="foreignkey")
    op.drop_constraint("fk_user_ratings_entity_id", "user_ratings", type_="foreignkey")
    op.drop_constraint("fk_relationships_to_entity_id", "relationships", type_="foreignkey")
    op.drop_constraint("fk_relationships_from_entity_id", "relationships", type_="foreignkey")
    op.drop_constraint("fk_entity_elo_scores_entity_id", "entity_elo_scores", type_="foreignkey")
    op.drop_constraint("fk_entity_rankings_entity_id", "entity_rankings", type_="foreignkey")

    op.drop_table("entities")