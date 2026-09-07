import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from .elo import update_ratings
from .models import VoteOutcome
from .repository import BattleRepository
from .schemas import CastVoteRequest, CastVoteResponse

MAX_VOTES_PER_DAY = 500  # tune as needed; generous but blocks scripted abuse


class BattleService:
    def __init__(self, repo: BattleRepository):
        self.repo = repo

    async def get_next_battle(self, category: str, user_id: uuid.UUID):
        anchor = await self.repo.get_random_entity(category)
        if anchor is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No entities found for category '{category}'",
            )
        anchor_elo = await self.repo.get_or_create_elo(anchor.id, category)

        opponent = await self.repo.get_closest_opponent(
            category=category,
            anchor_entity_id=anchor.id,
            anchor_elo=anchor_elo.elo_score,
            exclude_ids=[],
            user_id=user_id,
        )
        if opponent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Not enough entities in this category to form a battle",
            )
        opponent_elo = await self.repo.get_or_create_elo(opponent.id, category)
        await self.repo.commit()

        return anchor, anchor_elo, opponent, opponent_elo

    async def cast_vote(self, user_id: uuid.UUID, payload: CastVoteRequest) -> CastVoteResponse:
        await self._enforce_rate_limit(user_id)

        left_elo = await self.repo.get_or_create_elo(payload.left_item, payload.category)
        right_elo = await self.repo.get_or_create_elo(payload.right_item, payload.category)

        left_before, right_before = left_elo.elo_score, right_elo.elo_score

        new_left, new_right = update_ratings(
            left_rating=left_elo.elo_score,
            right_rating=right_elo.elo_score,
            left_matches=left_elo.matches_played,
            right_matches=right_elo.matches_played,
            outcome=payload.winner.value,
        )

        left_elo.elo_score = new_left
        right_elo.elo_score = new_right
        if payload.winner.value != "skip":
            left_elo.matches_played += 1
            right_elo.matches_played += 1

        vote = await self.repo.create_vote(
            user_id=user_id,
            category=payload.category,
            left_item=payload.left_item,
            right_item=payload.right_item,
            winner=VoteOutcome(payload.winner.value),
            left_score_before=left_before,
            right_score_before=right_before,
        )
        await self.repo.commit()

        return CastVoteResponse(
            vote_id=vote.id,
            left_item=payload.left_item,
            right_item=payload.right_item,
            left_score_before=left_before,
            right_score_before=right_before,
            left_score_after=new_left,
            right_score_after=new_right,
            created_at=vote.created_at,
        )

    async def _enforce_rate_limit(self, user_id: uuid.UUID):
        since = datetime.now(timezone.utc) - timedelta(days=1)
        count = await self.repo.count_votes_since(user_id, since)
        if count >= MAX_VOTES_PER_DAY:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Daily vote limit reached. Try again tomorrow.",
            )
