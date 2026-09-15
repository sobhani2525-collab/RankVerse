import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.modules.lists.models import ListType, ContributionMode


class ListCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    entity_type: str | None = None
    is_ranked: bool = True
    visibility: str = Field(default="public", pattern="^(public|unlisted|private)$")
    tags: list[str] = []
    list_type: ListType = ListType.RANKED
    contribution_mode: ContributionMode = ContributionMode.OWNER_ONLY


class ListUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    visibility: str | None = Field(default=None, pattern="^(public|unlisted|private)$")
    cover_image_url: str | None = None
    tags: list[str] | None = None
    list_type: ListType | None = None
    contribution_mode: ContributionMode | None = None


class ListItemCreate(BaseModel):
    entity_id: uuid.UUID
    note: str | None = None


class ListItemReorder(BaseModel):
    item_ids: list[uuid.UUID]


class ListItemLikeCreate(BaseModel):
    is_like: bool


class EntityMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    slug: str
    title: str
    entity_type: str
    poster_path: str | None = None


class ListItemPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    position: int
    note: str | None = None
    added_at: datetime
    added_by_user_id: uuid.UUID
    like_score: float | None = None
    like_count: int = 0
    dislike_count: int = 0
    is_own: bool = False
    can_remove: bool = False
    my_vote: bool | None = None
    entity: EntityMini


class ListSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    slug: str
    title: str
    description: str | None = None
    entity_type: str | None = None
    is_ranked: bool
    visibility: str
    cover_image_url: str | None = None
    tags: list[str] = []
    list_type: ListType
    contribution_mode: ContributionMode
    view_count: int
    like_count: int
    comment_count: int
    follower_count: int
    created_at: datetime
    owner_username: str | None = None


class ListDetail(ListSummary):
    items: list[ListItemPublic] = []
    is_liked: bool = False
    is_following: bool = False
    is_owner: bool = False

class ListItemSuggestion(BaseModel):
    entity: EntityMini
    reason: str
    reason_label_fa: str


class ListItemVoteResult(BaseModel):
    like_score: float | None
    like_count: int
    dislike_count: int
    my_vote: bool | None


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    parent_comment_id: uuid.UUID | None = None


class CommentPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    user_id: uuid.UUID
    username: str | None = None
    body: str
    parent_comment_id: uuid.UUID | None = None
    created_at: datetime