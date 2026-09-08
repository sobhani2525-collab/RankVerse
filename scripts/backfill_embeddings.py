import asyncio
from app.db.session import async_session
from app.features.embeddings.service import backfill_all_embeddings


async def main():
    async with async_session() as db:
        await backfill_all_embeddings(db)


if __name__ == "__main__":
    asyncio.run(main())