import uuid

from pydantic import BaseModel, ConfigDict


class RankingGroupRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    slug: str
    title: str


class RankingHighlight(BaseModel):
    """An entity's position within one automatic ranking group (e.g. a genre or a director's filmography)."""

    dimension: str
    group: RankingGroupRef
    rank: int
    group_size: int
