import uuid
from datetime import datetime
from typing import Literal

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
    contribution_mode: ContributionMode | None = None


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
    # Persian title when TMDb has one (see sync/normalizer._persian_title);
    # the frontend's displayTitle() composes "title_fa (title)".
    title_fa: str | None = None


class EntityRef(BaseModel):
    """A graph neighbour (person/genre) linked from a list item."""
    id: uuid.UUID
    slug: str
    title: str
    entity_type: str


class ListEdge(BaseModel):
    """Why display rank `from_rank` connects to `from_rank + 1`."""
    from_rank: int
    kind: Literal["people", "genre", "none"]
    label_fa: str | None = None
    # Joined target names ("A · B"); targets carry slugs for linking and,
    # for genres, the canonical name the frontend translates.
    value: str | None = None
    targets: list[EntityRef] = []


class ListBacklink(BaseModel):
    """Rank `rank` also shares a person with earlier, non-adjacent rank
    `target_position` (both 1-based display ranks)."""
    rank: int
    target_position: int
    person_name: str
    person_slug: str


class DnaCount(BaseModel):
    entity: EntityRef
    count: int


class DecadeCount(BaseModel):
    decade: int
    count: int


class ListDna(BaseModel):
    type_counts: dict[str, int] = {}
    genres: list[DnaCount] = []
    hubs: list[DnaCount] = []
    decades: list[DecadeCount] = []


class ListBattlePair(BaseModel):
    left_rank: int
    right_rank: int
    category: str
    kind: Literal["director", "actor"]
    label_fa: str
    person: EntityRef
    # Same-type pairs in the whole list, for "همه N جفت".
    pair_count: int


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
    year: int | None = None
    # A series' creator when it has one, else the (first) director.
    director: EntityRef | None = None
    lead_actor: EntityRef | None = None
    genres: list[EntityRef] = []
    # EntityRanking.computed_score -- None when the entity has no ranking
    # row yet; never filled in with a placeholder.
    composite_score: float | None = None


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
    # First few items (position order), for a poster collage on list cards.
    # Only populated by ListService.discover today -- other ListSummary call
    # sites (list_by_user, related, for-entity) don't eager-load items/owner,
    # so this stays empty and owner_username stays None there.
    preview_items: list[EntityMini] = Field(default_factory=list)


class RelatedListSummary(ListSummary):
    # Why this list is related: how many items it shares with the source
    # list, and/or a tag both carry. At least one is always set.
    shared_item_count: int = 0
    shared_tag: str | None = None


class ListDetail(ListSummary):
    updated_at: datetime | None = None
    items: list[ListItemPublic] = []
    is_liked: bool = False
    is_following: bool = False
    is_owner: bool = False
    # Constellation data (see app/modules/lists/graph.py), in display order.
    edges: list[ListEdge] = []
    backlinks: list[ListBacklink] = []
    dna: ListDna | None = None
    battle_pair: ListBattlePair | None = None

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