from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


def make_bulk_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """
    Sessions for long-running bulk scripts (scripts/import_tmdb_catalog.py)
    that want many concurrent connections. DATABASE_URL points at Supabase's
    session-mode pooler, which caps *all* clients -- the deployed backend
    included -- at 15, so a script holding a dozen connections there starves
    the live site. BULK_DATABASE_URL should point at the transaction-mode
    pooler instead (same host, port 6543), which doesn't have that cap but
    doesn't support asyncpg's named prepared statements, hence the
    statement-cache settings. Falls back to the regular engine when unset.
    """
    if not settings.bulk_database_url:
        return AsyncSessionLocal
    import uuid

    from sqlalchemy.pool import NullPool

    bulk_engine = create_async_engine(
        settings.bulk_database_url,
        poolclass=NullPool,
        connect_args={
            "statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid.uuid4()}__",
            # Fail instead of hanging forever when the network drops mid-run
            # (e.g. the machine went to sleep) -- a stuck connection otherwise
            # stalls its worker indefinitely.
            "timeout": 30,
            "command_timeout": 120,
        },
    )
    return async_sessionmaker(bind=bulk_engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base class for all ORM models."""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a DB session per-request."""
    async with AsyncSessionLocal() as session:
        yield session
