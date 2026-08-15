from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.schemas import envelope
from app.modules.sync.service import SyncService

router = APIRouter(prefix="/internal/sync", tags=["internal-sync"])


@router.post("/tmdb/movies/{tmdb_id}")
async def sync_one_movie(tmdb_id: int, db: AsyncSession = Depends(get_db)):
    service = SyncService(db)
    result = await service.sync_movie(tmdb_id)
    return envelope(data=result)


@router.post("/tmdb/bulk")
async def sync_bulk(pages: int = 5, db: AsyncSession = Depends(get_db)):
    service = SyncService(db)
    count = await service.bulk_sync_popular(pages)
    return envelope(data={"synced": count})
