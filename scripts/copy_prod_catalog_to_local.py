"""One-off: copy the catalog tables from the prod DB (.env DATABASE_URL, read-only)
into the local docker Postgres (postgresql://rankverse:rankverse@localhost:5432/rankverse).
User/admin tables are deliberately not copied. Usage: venv/Scripts/python.exe scripts/copy_prod_catalog_to_local.py
"""
import asyncio
import os
import sys
import tempfile
import time

import asyncpg

sys.path.insert(0, ".")
from app.config import settings  # noqa: E402

LOCAL = "postgresql://rankverse:rankverse@localhost:5432/rankverse"
TABLES = ["entities", "relationships", "entity_rankings", "entity_elo_scores"]


async def main() -> None:
    src = await asyncpg.connect(settings.database_url.replace("+asyncpg", ""), timeout=60)
    dst = await asyncpg.connect(LOCAL)
    for t in TABLES:
        t0 = time.time()
        await dst.execute(f"TRUNCATE {t} CASCADE")
        path = os.path.join(tempfile.gettempdir(), f"rv_{t}.copy")
        # Column order differs between prod and local (ALTERs over time), so
        # copy by name: the columns both sides have, in local's order.
        q = "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position"
        src_cols = {r[0] for r in await src.fetch(q, t)}
        cols = [r[0] for r in await dst.fetch(q, t) if r[0] in src_cols]
        await src.copy_from_table(t, output=path, columns=cols, schema_name="public")
        await dst.copy_to_table(t, source=path, columns=cols, schema_name="public")
        os.remove(path)
        n = await dst.fetchval(f"SELECT count(*) FROM {t}")
        print(f"{t}: {n} rows in {time.time() - t0:.0f}s", flush=True)
    await dst.execute("ANALYZE")
    await src.close()
    await dst.close()


asyncio.run(main())
