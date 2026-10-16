import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.rate_limit import client_ip
from app.modules.watch.service import WatchService

router = APIRouter(tags=["watch"])


@router.get("/watch-links/{link_id}/go", include_in_schema=False)
async def go(link_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """Counts the click, then sends the visitor to the streaming service."""
    url = await WatchService(db).track_click(link_id, client_ip(request))
    return RedirectResponse(url, status_code=302, headers={"X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store"})
