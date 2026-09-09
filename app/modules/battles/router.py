import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

# Adjust these two imports to match your project's actual paths.
from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user

from .repository import BattleRepository
from .schemas import BattleEntity, CastVoteRequest, CastVoteResponse, NextBattleResponse
from .service import BattleService

router = APIRouter(prefix="/battles", tags=["battles"])


def _poster_url(entity) -> str | None:
    """
    Entity has no dedicated poster_url column — image data (if any) lives
    inside the JSONB `attributes` field. Adjust the key names below to
    whatever your ingestion pipeline actually stores (e.g. TMDB's
    poster_path, a full poster_url, etc).
    """
    attrs = entity.attributes or {}
    return attrs.get("poster_url") or attrs.get("poster_path") or attrs.get("image_url")


def get_service(db: AsyncSession = Depends(get_db)) -> BattleService:
    return BattleService(BattleRepository(db))


@router.get("/next", response_model=NextBattleResponse)
async def get_next_battle(
    category: str = Query(..., examples=["movie"]),
    current_user=Depends(get_current_user),
    service: BattleService = Depends(get_service),
):
    """Return two entities of similar Elo rating for the user to vote on."""
    anchor, anchor_elo, opponent, opponent_elo = await service.get_next_battle(
        category=category, user_id=current_user.id
    )
    return NextBattleResponse(
        category=category,
        left=BattleEntity(
            id=anchor.id,
            title=anchor.title,
            poster_url=_poster_url(anchor),
            elo_score=anchor_elo.elo_score,
            matches_played=anchor_elo.matches_played,
        ),
        right=BattleEntity(
            id=opponent.id,
            title=opponent.title,
            poster_url=_poster_url(opponent),
            elo_score=opponent_elo.elo_score,
            matches_played=opponent_elo.matches_played,
        ),
    )


@router.post("/vote", response_model=CastVoteResponse, status_code=201)
async def cast_vote(
    payload: CastVoteRequest,
    current_user=Depends(get_current_user),
    service: BattleService = Depends(get_service),
):
    """Record a pairwise vote and update both entities' Elo ratings."""
    return await service.cast_vote(user_id=current_user.id, payload=payload)
