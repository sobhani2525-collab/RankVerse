import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from app.modules.entities.models import Entity
from app.modules.ranking.service import RankingService
from app.modules.taste.compute import ContributionStatsComputer

from .elo import update_ratings
from .models import VoteOutcome
from .repository import BattleRepository
from .schemas import CastVoteRequest, CastVoteResponse

MAX_VOTES_PER_DAY = 500  # tune as needed; generous but blocks scripted abuse


class BattleService:
    def __init__(self, repo: BattleRepository):
        self.repo = repo

    # Every DB round trip here is ~130ms (backend and DB are in different
    # regions), so these flows batch their reads and skip writes a read
    # doesn't need: showing a pair no longer creates Elo rows -- the first
    # vote on an entity does (get_elo_rows).

    async def get_next_battle(self, category: str, user_id: uuid.UUID):
        picked = await self.repo.get_random_entity(category)
        if picked is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No entities found for category '{category}'",
            )
        anchor, anchor_elo = picked
        anchor_elo = anchor_elo or self.repo.default_elo(anchor.id, category)

        closest = await self.repo.get_closest_opponent(
            category=category,
            anchor_entity_id=anchor.id,
            anchor_elo=anchor_elo.elo_score,
            exclude_ids=[],
            user_id=user_id,
        )
        if closest is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Not enough entities in this category to form a battle",
            )
        opponent, opponent_elo = closest
        opponent_elo = opponent_elo or self.repo.default_elo(opponent.id, category)

        return anchor, anchor_elo, opponent, opponent_elo

    async def get_battle_for_pair(self, left_id: uuid.UUID, right_id: uuid.UUID, category: str):
        """
        Pre-selected pair (e.g. from a "شروع Battle" deep link on a
        SuggestedBattleCard) instead of the random/closest-opponent pick
        above -- same same-type validation, same Elo lookup, just skips
        the selection step since the caller already chose both sides.
        """
        entities = await self._validate_matchup(left_id, right_id, category)
        elos = await self.repo.get_elo_map([left_id, right_id], category)

        return (
            entities[left_id],
            elos.get(left_id) or self.repo.default_elo(left_id, category),
            entities[right_id],
            elos.get(right_id) or self.repo.default_elo(right_id, category),
        )

    async def get_elo_rows(self, entity_ids: list[uuid.UUID], category: str) -> dict:
        """Both sides' Elo rows in one query, adding (unflushed) default rows
        for entities that have never battled -- they're written with the vote."""
        elos = await self.repo.get_elo_map(entity_ids, category)
        for entity_id in entity_ids:
            if entity_id not in elos:
                elos[entity_id] = self.repo.default_elo(entity_id, category)
                self.repo.db.add(elos[entity_id])
        return elos

    async def cast_vote(self, user_id: uuid.UUID, payload: CastVoteRequest) -> CastVoteResponse:
        await self._enforce_rate_limit(user_id)
        entities = await self._validate_matchup(payload.left_item, payload.right_item, payload.category)

        elos = await self.get_elo_rows([payload.left_item, payload.right_item], payload.category)
        left_elo, right_elo = elos[payload.left_item], elos[payload.right_item]

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
        if payload.winner.value != "skip":
            # Battle results feed the ranking score, so refresh both sides.
            await RankingService(self.repo.db).recompute_entities(
                [entities[payload.left_item], entities[payload.right_item]]
            )
        await ContributionStatsComputer(self.repo.db).compute_contribution_stats(user_id)
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

    async def _validate_matchup(
        self, left_item: uuid.UUID, right_item: uuid.UUID, category: str
    ) -> dict[uuid.UUID, Entity]:
        """
        Battles are same-type only (a movie battle stays movie-vs-movie, a
        tv_series battle stays tv_series-vs-tv_series) -- comparing a movie
        against a tv_series means something different to a user than
        comparing two of the same kind, so it's a hard product constraint,
        not an incidental limitation. category doubles as the entity_type
        filter everywhere else in this module (see BattleRepository), so
        both items must actually be of that type, not just match each other.

        Returns both entities, so callers don't fetch them again.
        """
        entities = await self.repo.get_entities([left_item, right_item])
        for item_id in (left_item, right_item):
            if item_id not in entities:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Entity '{item_id}' not found",
                )
        left_type, right_type = entities[left_item].entity_type, entities[right_item].entity_type
        if left_type != category or right_type != category:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Both items must be of type '{category}' to match the battle category "
                    f"(got '{left_type}' and '{right_type}')"
                ),
            )
        return entities

    async def _enforce_rate_limit(self, user_id: uuid.UUID):
        since = datetime.now(timezone.utc) - timedelta(days=1)
        count = await self.repo.count_votes_since(user_id, since)
        if count >= MAX_VOTES_PER_DAY:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Daily vote limit reached. Try again tomorrow.",
            )
