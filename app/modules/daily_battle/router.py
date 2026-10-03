import uuid

from fastapi import APIRouter, Depends, Header, Request, Response
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis import get_redis
from app.modules.auth.dependencies import get_current_user_optional

from .schemas import DailyBattleToday, DailyVoteRequest
from .service import DailyBattleService

# Raw JSON, like /battles/*: no {data, meta, error} envelope.
router = APIRouter(prefix="/daily-battle", tags=["daily-battle"])


def parse_guest_id(raw: str | None) -> str | None:
    """The client's localStorage UUID; anything else counts as no guest id."""
    if not raw or len(raw) > 64:
        return None
    try:
        return str(uuid.UUID(raw.strip()))
    except ValueError:
        return None


def client_ip(request: Request) -> str | None:
    ip = request.headers.get("cf-connecting-ip")
    if not ip:
        ip = (request.headers.get("x-forwarded-for") or "").split(",")[0]
    ip = ip.strip()
    if ip:
        return ip[:64]
    return request.client.host if request.client else None


@router.get("/today", response_model=DailyBattleToday)
async def get_today(
    response: Response,
    x_guest_id: str | None = Header(None),
    current_user=Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Today's pair (Tehran calendar day). Results stay null until the caller
    has voted; a signed-in user always takes precedence over a guest id."""
    response.headers["Cache-Control"] = "no-store"
    return await DailyBattleService(db).today(current_user.id if current_user else None, parse_guest_id(x_guest_id))


@router.post("/vote", response_model=DailyBattleToday)
async def vote(
    payload: DailyVoteRequest,
    request: Request,
    response: Response,
    x_guest_id: str | None = Header(None),
    current_user=Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Idempotent: a second vote by the same user/guest counts nothing and
    returns the current state."""
    response.headers["Cache-Control"] = "no-store"
    return await DailyBattleService(db).vote(
        daily_battle_id=payload.daily_battle_id,
        choice=payload.choice,
        user_id=current_user.id if current_user else None,
        guest_id=parse_guest_id(x_guest_id),
        ip=client_ip(request),
        redis=redis,
    )
