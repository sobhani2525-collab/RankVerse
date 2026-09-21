"""
Tests for the 1-5 star rating scale: boundary validation on the
RatingCreate schema/API, and the ccf13541a965 data migration that
rescaled user_ratings.score from the old 1-10 range.

Run with: TEST_DATABASE_URL=... pytest tests/test_ratings.py
"""
import importlib.util
from pathlib import Path

import pytest
import pytest_asyncio
from pydantic import ValidationError
from sqlalchemy import select, text

from app.modules.entities.models import Entity
from app.modules.entities.repository import EntityRepository
from app.modules.users.models import User, UserRating
from app.modules.users.schemas import RatingCreate

MIGRATION_PATH = (
    Path(__file__).resolve().parent.parent
    / "alembic"
    / "versions"
    / "ccf13541a965_rescale_user_ratings_to_five_stars.py"
)


def _load_migration():
    spec = importlib.util.spec_from_file_location("rescale_migration", MIGRATION_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# --- sync helpers, each run via AsyncConnection.run_sync(...) ---
#
# Alembic's Operations/MigrationContext are inherently synchronous, so
# testing the real migration module means bridging into sync code via
# run_sync. Keeping *every* step here -- seeding, running the migration,
# and reading results back -- inside run_sync calls (rather than mixing
# them with async ORM calls on the session afterward) matters: in
# practice, resuming an AsyncSession/AsyncConnection for ORM queries
# right after a run_sync call that itself drove Alembic's Operations left
# the async driver's greenlet bridge broken (MissingGreenlet errors).
# Each helper below is self-contained and returns plain data.


def _swap_in_old_constraint_sync(sync_conn) -> None:
    """Simulates the pre-migration schema: the test DB is built fresh from
    today's (already-migrated) models.py, so this swaps the 1-5 CHECK
    constraint back to the old 1-10 one before seeding old-scale scores."""
    sync_conn.execute(text("ALTER TABLE user_ratings DROP CONSTRAINT ck_rating_range"))
    sync_conn.execute(
        text("ALTER TABLE user_ratings ADD CONSTRAINT ck_rating_range CHECK (score >= 1 AND score <= 10)")
    )


def _seed_ratings_sync(sync_conn, score_by_key: dict[str, int]) -> dict:
    from sqlalchemy.orm import Session as SyncSession

    session = SyncSession(bind=sync_conn)
    user = User(email="migration-roundtrip@example.com", username="migration-roundtrip", hashed_password="x")
    session.add(user)
    session.flush()

    entity_id_by_key = {}
    for key, score in score_by_key.items():
        entity = Entity(entity_type="movie", title=key, slug=key, attributes={})
        session.add(entity)
        session.flush()
        session.add(UserRating(user_id=user.id, entity_id=entity.id, score=score))
        entity_id_by_key[key] = entity.id
    session.flush()
    return entity_id_by_key


def _run_migration_fn_sync(sync_conn, fn_name: str) -> None:
    from alembic.operations import Operations
    from alembic.runtime.migration import MigrationContext

    migration = _load_migration()
    ctx = MigrationContext.configure(sync_conn)
    with Operations.context(ctx):
        getattr(migration, fn_name)()


def _read_scores_and_constraint_sync(sync_conn, entity_id_by_key: dict) -> dict:
    from sqlalchemy.orm import Session as SyncSession

    session = SyncSession(bind=sync_conn)
    scores = {
        key: session.execute(
            select(UserRating.score).where(UserRating.entity_id == entity_id)
        ).scalar_one()
        for key, entity_id in entity_id_by_key.items()
    }
    constraint_def = sync_conn.execute(
        text(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
            "WHERE conname = 'ck_rating_range' AND conrelid = 'user_ratings'::regclass"
        )
    ).scalar_one()
    return {"scores": scores, "constraint_def": constraint_def}


@pytest_asyncio.fixture
async def migration_conn(test_engine):
    """A connection dedicated to migration tests, isolated from the shared
    db_session fixture's transaction (a different Postgres connection
    can't see another connection's uncommitted rows, so these tests seed
    their own user/entities rather than reusing test_user/db_session)."""
    async with test_engine.connect() as conn:
        await conn.begin()
        yield conn
        await conn.rollback()


async def _make_movie(db_session, slug: str):
    repo = EntityRepository(db_session)
    return await repo.create_entity(
        entity_type="movie", external_id=None, external_source=None,
        title=slug, slug=slug, attributes={},
    )


# --- boundary validation (Pydantic schema) ---


def test_rating_create_rejects_zero():
    with pytest.raises(ValidationError):
        RatingCreate(score=0)


def test_rating_create_rejects_six():
    with pytest.raises(ValidationError):
        RatingCreate(score=6)


def test_rating_create_accepts_boundary_values():
    assert RatingCreate(score=1).score == 1
    assert RatingCreate(score=5).score == 5


# --- boundary validation (API, end-to-end 422) ---


async def test_rate_movie_api_rejects_score_zero(client, db_session, auth_headers):
    movie = await _make_movie(db_session, "rating-boundary-zero")
    await db_session.commit()

    res = await client.post(
        f"/api/v1/movies/{movie.slug}/rate", headers=auth_headers, json={"score": 0}
    )
    assert res.status_code == 422


async def test_rate_movie_api_rejects_score_six(client, db_session, auth_headers):
    movie = await _make_movie(db_session, "rating-boundary-six")
    await db_session.commit()

    res = await client.post(
        f"/api/v1/movies/{movie.slug}/rate", headers=auth_headers, json={"score": 6}
    )
    assert res.status_code == 422


# --- ccf13541a965 migration: before/after ---


async def test_migration_rescales_existing_1_10_scores_to_1_5(migration_conn):
    """
    Seeds one rating per old (1-10) score value under the old constraint,
    runs the real migration's upgrade(), and checks every value lands
    exactly where the round-half-up mapping documented in the migration
    says it should -- plus that the constraint itself was tightened.
    """
    expected = {1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 10: 5}
    score_by_key = {f"old-score-{old}": old for old in expected}

    await migration_conn.run_sync(_swap_in_old_constraint_sync)
    entity_id_by_key = await migration_conn.run_sync(lambda c: _seed_ratings_sync(c, score_by_key))
    await migration_conn.run_sync(lambda c: _run_migration_fn_sync(c, "upgrade"))
    result = await migration_conn.run_sync(lambda c: _read_scores_and_constraint_sync(c, entity_id_by_key))

    assert "10" not in result["constraint_def"]
    for key, old_score in score_by_key.items():
        assert result["scores"][key] == expected[old_score], f"old score {old_score} rescaled incorrectly"


async def test_migration_upgrade_is_idempotent(migration_conn):
    """Running upgrade() twice must not halve already-converted scores again."""
    score_by_key = {"idempotent-test": 9}

    await migration_conn.run_sync(_swap_in_old_constraint_sync)
    entity_id_by_key = await migration_conn.run_sync(lambda c: _seed_ratings_sync(c, score_by_key))

    await migration_conn.run_sync(lambda c: _run_migration_fn_sync(c, "upgrade"))
    result = await migration_conn.run_sync(lambda c: _read_scores_and_constraint_sync(c, entity_id_by_key))
    assert result["scores"]["idempotent-test"] == 5  # round-half-up(9/2) = 5

    # Second run: constraint is already 1-5, so the guard must skip the rescale.
    await migration_conn.run_sync(lambda c: _run_migration_fn_sync(c, "upgrade"))
    result = await migration_conn.run_sync(lambda c: _read_scores_and_constraint_sync(c, entity_id_by_key))
    assert result["scores"]["idempotent-test"] == 5  # unchanged, not halved to 2 or 3


async def test_migration_downgrade_restores_1_10_constraint(migration_conn):
    """downgrade() is lossy on the data (documented in the migration), but
    must always leave the table with a working, enforced 1-10 constraint."""
    score_by_key = {"downgrade-test": 4}

    entity_id_by_key = await migration_conn.run_sync(lambda c: _seed_ratings_sync(c, score_by_key))
    await migration_conn.run_sync(lambda c: _run_migration_fn_sync(c, "downgrade"))
    result = await migration_conn.run_sync(lambda c: _read_scores_and_constraint_sync(c, entity_id_by_key))

    assert "10" in result["constraint_def"]
    assert result["scores"]["downgrade-test"] == 8  # 4 * 2, per the documented lossy reverse mapping
