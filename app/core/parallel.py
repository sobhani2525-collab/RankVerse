"""Overlapping independent reads of one request.

An AsyncSession runs one statement at a time and every round trip to the
remote DB costs ~130ms+, so independent queries go on short-lived sessions of
their own and run together. Both helpers are module attributes so tests can
point them back at the single test transaction (see tests/conftest.py).
"""
import asyncio
from contextlib import asynccontextmanager

from app.core.database import ReadSessionLocal


@asynccontextmanager
async def side_session():
    async with ReadSessionLocal() as session:
        yield session


async def gather(*aws):
    return await asyncio.gather(*aws)
