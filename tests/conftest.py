"""
Shared fixtures for the integration test suite.

These tests need a real Postgres database with the pgvector extension
available (the ORM models use postgresql UUID/JSONB columns and a
pgvector Vector(384) column, none of which SQLite can represent) — point
TEST_DATABASE_URL at a scratch database before running:

    TEST_DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/rankverse_test" pytest

Never point TEST_DATABASE_URL at the same database as DATABASE_URL/.env —
each test runs inside a transaction that's rolled back afterward, but the
session-scoped fixture below still creates and drops every table up front.
"""
import asyncio
import os

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings
from app.core.database import Base
from app.core.security import create_access_token, hash_password

# Import every module's models so they're registered on Base.metadata
# before create_all runs (mirrors alembic/env.py's explicit imports).
from app.modules.entities import models as _entities_models  # noqa: F401
from app.modules.users import models as _users_models  # noqa: F401
from app.modules.lists import models as _lists_models  # noqa: F401
from app.modules.battles import models as _battles_models  # noqa: F401
from app.modules.taste import models as _taste_models  # noqa: F401
from app.modules.users.repository import UserRepository


def _test_database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.exit(
            "TEST_DATABASE_URL is not set. Point it at a scratch Postgres "
            "database with the pgvector extension available (never your "
            "production DATABASE_URL) before running this suite.",
            returncode=1,
        )
    if url == settings.database_url:
        pytest.exit(
            "TEST_DATABASE_URL must not be the same as DATABASE_URL/.env — "
            "refusing to run tests (which create and roll back data) against "
            "what looks like your real database.",
            returncode=1,
        )
    return url


@pytest.fixture(scope="session")
def test_engine():
    # A plain (non-async) session-scoped fixture on purpose: pytest-asyncio
    # gives each test function its own event loop, and asyncpg connections
    # are bound to the loop that created them. NullPool means every
    # engine.connect() opens a fresh raw connection instead of reusing one
    # from a pool that might belong to an already-closed loop, so this one
    # engine object is safe to share across every test's event loop.
    # Session-wide setup/teardown below use their own throwaway loop via
    # asyncio.run() since no test loop exists yet at fixture-setup time.
    engine = create_async_engine(_test_database_url(), echo=False, poolclass=NullPool)

    async def _create_schema():
        async with engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_create_schema())
    yield engine

    async def _drop_schema():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    asyncio.run(_drop_schema())


@pytest_asyncio.fixture
async def db_session(test_engine):
    """A session bound to a transaction that's rolled back after each test."""
    async with test_engine.connect() as conn:
        await conn.begin()
        async with AsyncSession(
            bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint"
        ) as session:
            yield session
        await conn.rollback()


@pytest_asyncio.fixture
async def client(db_session):
    """An httpx client wired to the FastAPI app, sharing db_session's transaction."""
    from app.core.database import get_db
    from app.main import app

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)


@pytest_asyncio.fixture
async def test_user(db_session):
    repo = UserRepository(db_session)
    user = await repo.create(
        email="tester@example.com",
        username="tester",
        hashed_password=hash_password("Sup3rSecret!1"),
    )
    await db_session.commit()
    return user


@pytest.fixture
def auth_token(test_user):
    return create_access_token(str(test_user.id))


@pytest.fixture
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}"}
