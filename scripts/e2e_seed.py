"""
Builds an empty schema and a couple of titles for the browser (Playwright) tests.

Run only against a scratch database (CI starts a throwaway pgvector Postgres):

    DATABASE_URL=postgresql+asyncpg://... python scripts/e2e_seed.py

It refuses to run unless the database name contains "e2e" or "test", so it can never
be pointed at the real database by accident.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from sqlalchemy.engine import make_url

from app.config import settings
from app.core.database import AsyncSessionLocal, Base, engine

# Every model module must be imported before create_all (mirrors alembic/env.py).
from app.modules.entities import models as _entities  # noqa: F401
from app.modules.users import models as _users  # noqa: F401
from app.modules.lists import models as _lists  # noqa: F401
from app.modules.taste import models as _taste  # noqa: F401
from app.modules.battles import models as _battles  # noqa: F401
from app.modules.daily_battle import models as _daily_battle  # noqa: F401
from app.modules.admin import models as _admin  # noqa: F401
from app.modules.watch import models as _watch  # noqa: F401
from app.modules.entities.repository import EntityRepository

MOVIES = [
    ("E2E Movie", "فیلم آزمایشی", "e2e-movie-2001", 2001),
    ("E2E Second Movie", "فیلم آزمایشی دوم", "e2e-second-movie-2002", 2002),
]


def _guard() -> None:
    name = (make_url(settings.database_url).database or "").lower()
    if "e2e" not in name and "test" not in name:
        sys.exit(f"Refusing to seed database '{name}': its name must contain 'e2e' or 'test'.")


async def main() -> None:
    _guard()
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        repo = EntityRepository(db)
        for title, title_fa, slug, year in MOVIES:
            await repo.create_entity(
                entity_type="movie", external_id=None, external_source=None,
                title=title, slug=slug,
                attributes={"title_fa": title_fa, "year": year, "overview": "خلاصهٔ فیلم آزمایشی."},
            )
        await db.commit()
    print(f"Seeded {len(MOVIES)} movies.")


if __name__ == "__main__":
    asyncio.run(main())
