import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

# Adjust these two imports to match your project's actual paths.
from app.core.database import get_db
from app.modules.auth.dependencies import get_current_user, get_current_user_optional

from .repository import BattleRepository
from .schemas import (
    BattleEntity,
    CastVoteRequest,
    CastVoteResponse,
    NextBattleResponse,
    ThemedBattleResponse,
    ThemedBattleTheme,
)
from .service import BattleService
from .themed import CATEGORY, ThemedBattleService

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
    left_id: uuid.UUID | None = Query(None),
    right_id: uuid.UUID | None = Query(None),
    current_user=Depends(get_current_user),
    service: BattleService = Depends(get_service),
):
    """
    Return two entities of similar Elo rating for the user to vote on --
    or, when left_id/right_id are both given (e.g. from a SuggestedBattleCard's
    "شروع Battle" link), that exact pre-selected pair instead of a random one.
    """
    if left_id is not None and right_id is not None:
        anchor, anchor_elo, opponent, opponent_elo = await service.get_battle_for_pair(
            left_id, right_id, category
        )
    else:
        anchor, anchor_elo, opponent, opponent_elo = await service.get_next_battle(
            category=category, user_id=current_user.id
        )
    return NextBattleResponse(
        category=category,
        left=BattleEntity(
            id=anchor.id,
            title=anchor.title,
            title_fa=(anchor.attributes or {}).get("title_fa"),
            poster_url=_poster_url(anchor),
            elo_score=anchor_elo.elo_score,
            matches_played=anchor_elo.matches_played,
        ),
        right=BattleEntity(
            id=opponent.id,
            title=opponent.title,
            title_fa=(opponent.attributes or {}).get("title_fa"),
            poster_url=_poster_url(opponent),
            elo_score=opponent_elo.elo_score,
            matches_played=opponent_elo.matches_played,
        ),
    )


@router.get("/themed", response_model=ThemedBattleResponse)
async def get_themed_battle(
    category: str = Query(CATEGORY),
    left_id: uuid.UUID | None = Query(None),
    right_id: uuid.UUID | None = Query(None),
    current_user=Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """
    A run of movies sharing a genre / decade / director for the home page's
    battle arena. Open to guests (random theme); a signed-in user's theme
    comes from their taste. Votes still go through POST /battles/vote.
    """
    pool = await ThemedBattleService(db, category).get_pool(
        current_user.id if current_user else None, left_id, right_id
    )
    if pool is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not enough movies to form a battle")
    return ThemedBattleResponse(
        category=category,
        theme=ThemedBattleTheme(kind=pool.theme.kind, value=pool.theme.value, personalized=pool.personalized),
        items=pool.items,
    )


@router.post("/vote",response_model=CastVoteResponse, status_code=201)
async def cast_vote(
    payload: CastVoteRequest,
    current_user=Depends(get_current_user),
    service: BattleService = Depends(get_service),
):
    """Record a pairwise vote and update both entities' Elo ratings."""
    return await service.cast_vote(user_id=current_user.id, payload=payload)
