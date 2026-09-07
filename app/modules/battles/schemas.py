import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, field_validator


class VoteOutcomeSchema(str, Enum):
    LEFT = "left"
    RIGHT = "right"
    SKIP = "skip"


class BattleEntity(BaseModel):
    """Minimal entity payload shown to the user in a battle card."""

    id: uuid.UUID
    title: str
    poster_url: str | None = None
    elo_score: float
    matches_played: int

    model_config = {"from_attributes": True}


class NextBattleResponse(BaseModel):
    category: str
    left: BattleEntity
    right: BattleEntity


class CastVoteRequest(BaseModel):
    category: str = Field(..., examples=["movie"])
    left_item: uuid.UUID
    right_item: uuid.UUID
    winner: VoteOutcomeSchema

    @field_validator("winner", mode="before")
    @classmethod
    def normalize_winner_case(cls, v):
        # Swagger's field for this is free text, not a locked dropdown,
        # so accept "LEFT" / "Left" / "left" etc. and normalize to the
        # lowercase enum value the DB expects.
        if isinstance(v, str):
            return v.lower()
        return v

    @field_validator("right_item")
    @classmethod
    def items_must_differ(cls, v, info):
        left = info.data.get("left_item")
        if left is not None and v == left:
            raise ValueError("left_item and right_item must be different entities")
        return v


class CastVoteResponse(BaseModel):
    vote_id: uuid.UUID
    left_item: uuid.UUID
    right_item: uuid.UUID
    left_score_before: float
    right_score_before: float
    left_score_after: float
    right_score_after: float
    created_at: datetime


class EntityEloScoreResponse(BaseModel):
    entity_id: uuid.UUID
    category: str
    elo_score: float
    matches_played: int

    model_config = {"from_attributes": True}