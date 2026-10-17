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
from app.modules.daily_battle import models as _daily_battle_models  # noqa: F401
from app.modules.admin import models as _admin_models  # noqa: F401
from app.modules.taste import models as _taste_models  # noqa: F401
from app.modules.watch import models as _watch_models  # noqa: F401
from app.modules.notifications import models as _notifications_models  # noqa: F401
from app.modules.alerts import models as _alerts_models  # noqa: F401
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


@pytest.fixture(autouse=True)
def _fresh_response_cache():
    """The in-process response cache outlives a test's rolled-back data."""
    from app.core.cache import cache
    from app.modules.entities import person_stats, repository

    cache.clear()
    repository._person_stats_ready = False
    person_stats._known_fresh_until = None
    yield
    cache.clear()
    repository._person_stats_ready = False
    person_stats._known_fresh_until = None


@pytest.fixture(autouse=True)
def _inline_taste_refresh(monkeypatch):
    """Taste DNA normally refreshes in a background task on its own session
    (app/modules/taste/refresh.py), which would open real DATABASE_URL
    connections and race the assertions -- tests run it inline in the
    request's own session instead."""
    from app.modules.taste import refresh

    monkeypatch.setattr(refresh, "refresh", refresh.refresh_now)


@pytest.fixture(autouse=True)
def _no_background_side_effects(monkeypatch):
    """Notifications and admin alerts normally run on their own sessions against
    DATABASE_URL (the real DB). Silence them by default; tests/test_notifications.py
    and tests/test_alerts.py opt back in, pointed at the test transaction."""
    from app.modules.alerts import middleware as alerts_middleware
    from app.modules.alerts import service as alerts_service
    from app.modules.notifications import service as notifications_service

    async def _noop(**kwargs):
        return None

    monkeypatch.setattr(notifications_service, "notify_later", _noop)
    monkeypatch.setattr(alerts_service, "raise_alert_nowait", lambda *a, **k: None)
    monkeypatch.setattr(alerts_middleware, "raise_alert_nowait", lambda *a, **k: None)


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
async def client(db_session, monkeypatch):
    """An httpx client wired to the FastAPI app, sharing db_session's transaction."""
    from contextlib import asynccontextmanager

    from app.core.database import get_db, get_read_db
    from app.main import app
    from app.modules.lists import router as lists_router
    from app.modules.lists import service as lists_service
    from app.modules.lists.repository import ListRepository

    # The list page overlaps queries on extra connections and counts views in
    # a background session; in tests everything must stay on the one
    # transaction, so run it inline and in sequence.
    @asynccontextmanager
    async def _side_session():
        yield db_session

    async def _sequential(*aws):
        return [await a for a in aws]

    async def _record_view(list_id):
        await ListRepository(db_session).increment_view(list_id)

    from app.core import database as database_module

    from app.core import parallel

    monkeypatch.setattr(parallel, "side_session", _side_session)
    monkeypatch.setattr(parallel, "gather", _sequential)
    monkeypatch.setattr(database_module, "background_read_session", lambda: _side_session())
    monkeypatch.setattr(lists_service, "_side_session", _side_session)
    monkeypatch.setattr(lists_service, "_gather", _sequential)
    monkeypatch.setattr(lists_router, "record_list_view", _record_view)

    async def _override_get_db():
        yield db_session

    # Read-only endpoints use get_read_db; both share the test transaction
    # so reads see what the test wrote.
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_read_db] = _override_get_db
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_read_db, None)


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


@pytest.fixture(autouse=True)
def _isolated_rate_limits(monkeypatch):
    """Auth endpoints are rate-limited; keep tests off real Redis and give each a clean counter."""
    from redis.exceptions import RedisError

    from app.core import rate_limit

    async def _no_redis():
        raise RedisError("disabled in tests")

    monkeypatch.setattr(rate_limit, "get_redis", _no_redis)
    rate_limit._local.clear()
    yield
    rate_limit._local.clear()
