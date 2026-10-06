import uuid

from app.core.slug import persian_slugify
from app.modules.lists.models import UserList, UserListItem, ContributionMode, ListType
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import NotFoundError, AlreadyExistsError, ForbiddenError, UnauthorizedError, ValidationError
from app.modules.entities.repository import EntityRepository
from app.modules.entities.service import _extract_media
from app.modules.lists.repository import ListRepository
from app.modules.lists.similar import SIMILARITY_THRESHOLD, content_words, normalize, similarity
from app.modules.lists.scoring import compute_like_score, community_order_key, is_list_active
from app.modules.lists.graph import (
    CREDIT_RELATIONS, GraphItem, RELATION_LABELS_FA, RELATION_LABEL_FALLBACK_FA,
    compute_backlinks, compute_dna, compute_edges, person_graph_data, pick_battle_pair,
)
from app.modules.lists.suggest import build_profile, explain_candidate
from app.modules.lists.title_hints import parse_title_hints
from app.modules.lists.schemas import (
    CandidateReason, ListCreate, ListUpdate, ListItemCreate, ListSummary, ListDetail,
    ListItemPublic, EntityMini, EntityRef, CommentCreate, CommentPublic, ListItemVoteResult,
    ListItemSuggestion, RelatedListSummary, ListCandidate,
)
from app.modules.search.router import find_entities_by_title
from app.modules.taste.compute import ContributionStatsComputer

# Relation types the list-detail constellation reads (see graph.py).
GRAPH_RELATION_TYPES = ["directed_by", "creator", "acted_in", "has_genre"]

# Title of the one private, owner-only "will watch" list every user gets --
# see ListService.get_or_create_watch_later_list.
WATCH_LATER_TITLE = "تماشا خواهم کرد"
# Frontend routes living directly under /lists/ -- no list may take their slug.
RESERVED_LIST_SLUGS = {"new"}

_FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
# Genre entity title (lower-cased) -> Persian name for the "why" line.
_GENRE_FA = {
    "action": "اکشن", "adventure": "ماجراجویی", "animation": "انیمیشن", "comedy": "کمدی", "crime": "جنایی",
    "documentary": "مستند", "drama": "درام", "family": "خانوادگی", "fantasy": "فانتزی", "history": "تاریخی",
    "horror": "ترسناک", "music": "موسیقی", "mystery": "معمایی", "romance": "عاشقانه",
    "science fiction": "علمی‌تخیلی", "thriller": "هیجانی", "war": "جنگی", "western": "وسترن",
}

# A draft can't be published (private -> public) with fewer items than this.
MIN_ITEMS_TO_PUBLISH = 5


def _entity_mini(entity) -> EntityMini:
    attributes = entity.attributes or {}
    return EntityMini(
        id=entity.id,
        slug=entity.slug,
        title=entity.title,
        entity_type=entity.entity_type,
        poster_path=attributes.get("poster_path"),
        title_fa=attributes.get("title_fa"),
        media=_extract_media(attributes),
    )


def _entity_ref(entity) -> EntityRef:
    return EntityRef(
        id=entity.id, slug=entity.slug, title=entity.title,
        title_fa=(entity.attributes or {}).get("title_fa"), entity_type=entity.entity_type,
    )


def _build_graph_items(
    entities: list, edges: list[tuple], person_data: dict | None = None
) -> list[GraphItem]:
    """One GraphItem per entity (same order), from graph_edges_for_entities
    rows. Cast is sorted by TMDb billing order; directors by episode share
    (series) then name; creators and genres by name. person_data (see
    graph.person_graph_data) adds each person's filmography."""
    person_data = person_data or {}
    by_entity: dict[uuid.UUID, dict[str, list[tuple]]] = {}
    for from_id, relation_type, metadata, target in edges:
        by_entity.setdefault(from_id, {}).setdefault(relation_type, []).append((metadata, target))

    items = []
    for entity in entities:
        rels = by_entity.get(entity.id, {})
        directors = sorted(
            rels.get("directed_by", []),
            key=lambda r: (-(r[0].get("episode_count") or 0), r[1].title),
        )
        cast = sorted(rels.get("acted_in", []), key=lambda r: (r[0].get("order", 99), r[1].title))
        creators = sorted(rels.get("creator", []), key=lambda r: r[1].title)
        genres = sorted(rels.get("has_genre", []), key=lambda r: r[1].title)
        credits, career_genres = person_data.get(entity.id, ({}, []))
        items.append(GraphItem(
            entity_id=entity.id,
            ref=_entity_ref(entity),
            credits=credits,
            career_genres=career_genres,
            entity_type=entity.entity_type,
            year=(entity.attributes or {}).get("year"),
            directors=[_entity_ref(t) for _, t in directors],
            creators=[_entity_ref(t) for _, t in creators],
            cast=[_entity_ref(t) for _, t in cast],
            genres=[_entity_ref(t) for _, t in genres],
        ))
    return items


def _display_order(lst: UserList) -> list[UserListItem]:
    """The list's items in the order the detail page ranks them."""
    ordered = list(lst.items)
    if lst.list_type == ListType.COMMUNITY_ORDERED:
        ordered.sort(key=lambda i: community_order_key(i.id, i.like_score, i.added_at))
    else:
        ordered.sort(key=lambda i: i.position)
    return ordered


def _item_graph_fields(entity, node: GraphItem) -> dict:
    """The per-item graph fields shown on a list card (and on an add-item
    candidate): a series' creator when it has one, else the (first)
    director; the top-billed actor; genres; the synopsis."""
    if entity.entity_type == "tv_series":
        director = (node.creators or node.directors or [None])[0]
    else:
        director = (node.directors or node.creators or [None])[0]
    return {
        "year": node.year,
        "director": director,
        "lead_actor": node.cast[0] if node.cast else None,
        "genres": node.genres,
        # A person has no overview -- its synopsis-equivalent is its
        # biography (see sync/normalizer.person_biography_attrs).
        "overview": (entity.attributes or {}).get("overview")
        or (entity.attributes or {}).get("biography")
        or None,
    }


class ListService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = ListRepository(db)
        self.entity_repo = EntityRepository(db)

    async def _unique_slug(self, title: str, list_id: uuid.UUID | None = None) -> str:
        base = persian_slugify(title, max_length=200)
        slug = base
        suffix = 1
        while slug in RESERVED_LIST_SLUGS or await self.repo.slug_exists(slug, exclude_list_id=list_id):
            suffix += 1
            slug = f"{base}-{suffix}"
        return slug

    async def create_list(self, user_id: uuid.UUID, payload: ListCreate) -> UserList:
        """Every manually-created list is open to anyone's contributions and
        ordered by community vote -- see ListCreate's docstring for why those
        aren't payload fields anymore. Visibility is the exception: a list
        created "private" is a draft until its owner publishes it."""
        slug = await self._unique_slug(payload.title)
        lst = await self.repo.create_list(
            user_id=user_id,
            title=payload.title,
            slug=slug,
            description=payload.description,
            entity_type=payload.entity_type,
            is_ranked=True,
            visibility=payload.visibility,
            tags=payload.tags,
            list_type=ListType.COMMUNITY_ORDERED,
            contribution_mode=ContributionMode.ANYONE,
        )
        # Creators follow their own list by default (they can unfollow).
        await self.repo.add_follow(lst.id, user_id)
        await self.db.commit()
        return lst

    async def get_or_create_watch_later_list(self, user_id: uuid.UUID) -> UserList:
        """The one private, owner-only "will watch" list every user gets,
        created lazily the first time they bookmark something."""
        lst = await self.repo.get_watch_later_list(user_id)
        if lst:
            return lst
        slug = await self._unique_slug(WATCH_LATER_TITLE)
        lst = await self.repo.create_list(
            user_id=user_id,
            title=WATCH_LATER_TITLE,
            slug=slug,
            description=None,
            entity_type=None,
            is_ranked=True,
            visibility="private",
            tags=[],
            list_type=ListType.RANKED,
            contribution_mode=ContributionMode.OWNER_ONLY,
            is_watch_later=True,
        )
        await self.db.commit()
        return lst

    async def get_watch_later_entity_ids(self, user_id: uuid.UUID) -> list[uuid.UUID]:
        lst = await self.get_or_create_watch_later_list(user_id)
        return [item.entity_id for item in lst.items]

    async def get_watch_later_items(self, user_id: uuid.UUID) -> list[EntityMini]:
        """Full entity data for the caller's watch-later list, newest-added
        first -- for the profile page's "later" gallery (the bookmark
        button only needs get_watch_later_entity_ids, above)."""
        lst = await self.get_or_create_watch_later_list(user_id)
        return [_entity_mini(item.entity) for item in reversed(lst.items)]

    async def toggle_watch_later(self, user_id: uuid.UUID, entity_id: uuid.UUID) -> bool:
        """Adds/removes entity_id from the caller's watch-later list;
        returns whether it's in the list afterwards."""
        lst = await self.get_or_create_watch_later_list(user_id)

        existing = await self.repo.get_item_by_entity(lst.id, entity_id)
        if existing:
            await self.repo.remove_item(existing)
            await self.repo.touch(lst.id)
            await self.db.commit()
            return False

        entity = await self.entity_repo.get_by_id(entity_id)
        if not entity:
            raise NotFoundError("Entity not found")

        position = await self.repo.max_position(lst.id) + 1
        await self.repo.add_item(
            lst.id, entity.id, entity.entity_type, None, position, added_by_user_id=user_id
        )
        await self.repo.touch(lst.id)
        await self.db.commit()
        return True

    def _can_add_item(self, lst: UserList, user_id: uuid.UUID, is_following: bool) -> bool:
        if user_id == lst.user_id:
            return True
        if lst.contribution_mode == ContributionMode.ANYONE:
            return True
        if lst.contribution_mode == ContributionMode.FOLLOWERS_ONLY:
            return is_following
        return False

    async def get_list_detail(self, slug: str, current_user_id: uuid.UUID | None) -> ListDetail:
        lst = await self.repo.get_detail_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")

        if lst.visibility == "private" and (not current_user_id or current_user_id != lst.user_id):
            raise NotFoundError(f"List '{slug}' not found")

        await self.repo.increment_view(lst.id)
        await self.db.commit()

        is_liked = False
        is_following = False
        is_owner = (current_user_id == lst.user_id) if current_user_id else False
        my_votes: dict[uuid.UUID, bool] = {}
        if current_user_id:
            is_liked = (await self.repo.get_like(lst.id, current_user_id)) is not None
            is_following = (await self.repo.get_follow(lst.id, current_user_id)) is not None
            my_votes = await self.repo.user_item_votes_for_list(lst.id, current_user_id)

        vote_counts = await self.repo.item_vote_counts_for_list(lst.id)

        ordered = _display_order(lst)

        entities = [item.entity for item in ordered]
        graph_rows = await self.repo.graph_edges_for_entities(
            [e.id for e in entities], GRAPH_RELATION_TYPES
        )
        graph_items = _build_graph_items(
            entities, graph_rows, await self._person_graph_data(entities)
        )

        items = []
        for item, node in zip(ordered, graph_items):
            ranking = item.entity.ranking
            items.append(ListItemPublic(
                id=item.id,
                position=item.position,
                note=item.note,
                added_at=item.added_at,
                added_by_user_id=item.added_by_user_id,
                like_score=item.like_score,
                like_count=vote_counts.get(item.id, (0, 0))[0],
                dislike_count=vote_counts.get(item.id, (0, 0))[1],
                is_own=(current_user_id == item.added_by_user_id) if current_user_id else False,
                can_remove=is_owner or (current_user_id == item.added_by_user_id if current_user_id else False),
                my_vote=my_votes.get(item.id),
                entity=_entity_mini(item.entity),
                **_item_graph_fields(item.entity, node),
                composite_score=ranking.computed_score if ranking else None,
            ))

        cast_depth = settings.list_graph_cast_depth
        priority = [p.strip() for p in settings.list_graph_edge_priority.split(",") if p.strip()]

        contributor_count = await self.repo.count_contributors(lst.id)

        return ListDetail(
            id=lst.id,
            slug=lst.slug,
            title=lst.title,
            description=lst.description,
            entity_type=lst.entity_type,
            is_ranked=lst.is_ranked,
            visibility=lst.visibility,
            cover_image_url=lst.cover_image_url,
            tags=lst.tags,
            list_type=lst.list_type,
            contribution_mode=lst.contribution_mode,
            view_count=lst.view_count,
            like_count=lst.like_count,
            comment_count=lst.comment_count,
            follower_count=lst.follower_count,
            created_at=lst.created_at,
            updated_at=lst.updated_at,
            owner_username=lst.owner.username if lst.owner else None,
            owner_avatar_key=lst.owner.avatar_key if lst.owner else None,
            owner_display_name=lst.owner.display_name if lst.owner else None,
            items=items,
            is_liked=is_liked,
            is_following=is_following,
            is_owner=is_owner,
            edges=compute_edges(
                graph_items, priority, cast_depth, settings.list_graph_max_genres_per_edge
            ),
            backlinks=compute_backlinks(graph_items, cast_depth),
            dna=compute_dna(
                graph_items, cast_depth,
                settings.list_graph_hub_limit, settings.list_graph_hub_min_items,
            ) if graph_items else None,
            battle_pair=pick_battle_pair(graph_items, cast_depth),
            contributor_count=contributor_count,
            is_active=is_list_active(contributor_count),
        )

    async def _person_graph_data(self, entities: list) -> dict:
        """Filmography + dominant genres for each person among `entities`
        (see graph.person_graph_data); {} when the list has no people."""
        person_ids = [e.id for e in entities if e.entity_type == "person"]
        credit_rows = await self.repo.person_credits(person_ids, list(CREDIT_RELATIONS))
        if not credit_rows:
            return {}
        work_ids = list({work.id for _, _, work in credit_rows})
        genre_rows = await self.repo.graph_edges_for_entities(work_ids, ["has_genre"])
        return person_graph_data(
            [(pid, rel, _entity_ref(work)) for pid, rel, work in credit_rows],
            [(from_id, _entity_ref(genre)) for from_id, _, _, genre in genre_rows],
        )

    async def update_list(self, user_id: uuid.UUID, slug: str, payload: ListUpdate) -> UserList:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")
        if lst.user_id != user_id:
            raise UnauthorizedError("You don't have permission to edit this list")

        if payload.visibility == "public" and lst.visibility != "public":
            if await self.repo.count_items(lst.id) < MIN_ITEMS_TO_PUBLISH:
                raise ValidationError(f"برای انتشار فهرست حداقل {MIN_ITEMS_TO_PUBLISH} آیتم لازم است")

        if payload.title is not None and payload.title != lst.title:
            new_slug = await self._unique_slug(payload.title, list_id=lst.id)
            if new_slug != lst.slug:
                await self.repo.release_old_slug(lst.id, new_slug)
                await self.repo.record_old_slug(lst.id, lst.slug)
                lst.slug = new_slug

        await self.repo.update_list(
            lst,
            title=payload.title,
            description=payload.description,
            visibility=payload.visibility,
            cover_image_url=payload.cover_image_url,
            tags=payload.tags,
            list_type=payload.list_type,
            contribution_mode=payload.contribution_mode,
        )
        await self.db.commit()
        return lst

    async def sitemap_entries(self) -> list[dict]:
        rows = await self.repo.sitemap_entries()
        return [{"slug": slug, "updated_at": updated_at} for slug, updated_at in rows]

    async def delete_list(self, user_id: uuid.UUID, slug: str) -> None:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")
        if lst.user_id != user_id:
            raise UnauthorizedError("You don't have permission to delete this list")

        await self.repo.delete_list(lst)
        await self.db.commit()

    async def list_user_lists(self, user_id: uuid.UUID) -> list[ListSummary]:
        lists = await self.repo.list_by_user(user_id)
        return [self._to_summary_with_preview(lst) for lst in lists]

    async def list_user_public_lists(self, user_id: uuid.UUID) -> list[ListSummary]:
        lists = await self.repo.list_by_user_public(user_id)
        return [self._to_summary_with_preview(lst) for lst in lists]

    async def discover(
        self,
        page: int,
        page_size: int,
        entity_type: str | None,
        tag: str | None,
        sort_by: str,
        quality_only: bool = False,
        q: str | None = None,
    ) -> tuple[list[ListSummary], int]:
        lists, total = await self.repo.discover(page, page_size, entity_type, tag, sort_by, quality_only, q)
        return [self._to_summary_with_preview(lst) for lst in lists], total

    async def featured(self, limit: int) -> list[ListSummary]:
        return [self._to_summary_with_preview(lst) for lst in await self.repo.featured(limit)]

    async def similar_lists(self, title: str, limit: int = 5) -> list[dict]:
        """Existing public lists whose title looks like `title`, best match
        first -- shown on the new-list form so people don't create duplicates."""
        words = sorted(content_words(title))[:6]
        candidates = await self.repo.similar_title_candidates(words)
        scored = []
        for lst, item_count in candidates:
            score = similarity(title, lst.title)
            if score >= SIMILARITY_THRESHOLD:
                scored.append((score, lst, item_count))
        scored.sort(key=lambda row: (row[0], row[1].like_count), reverse=True)
        return [
            {
                "slug": lst.slug,
                "title": lst.title,
                "owner_username": lst.owner.username if lst.owner else None,
                "item_count": item_count,
                "like_count": lst.like_count,
                "exact": score >= 1.0,
            }
            for score, lst, item_count in scored[:limit]
        ]

    def _to_summary_with_preview(self, lst: UserList) -> ListSummary:
        """Like ListSummary.model_validate(lst), plus owner_username and a
        5-item poster preview -- requires `owner` and `items.entity` to
        already be eager-loaded (see ListRepository.discover)."""
        summary = ListSummary.model_validate(lst)
        summary.owner_username = lst.owner.username if lst.owner else None
        summary.owner_avatar_key = lst.owner.avatar_key if lst.owner else None
        summary.owner_display_name = lst.owner.display_name if lst.owner else None
        summary.preview_items = [_entity_mini(item.entity) for item in lst.items[:5]]
        return summary

    # --- Items ---

    async def add_item(self, user_id: uuid.UUID, slug: str, payload: ListItemCreate) -> ListItemPublic:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")

        is_following = False
        if user_id != lst.user_id and lst.contribution_mode == ContributionMode.FOLLOWERS_ONLY:
            is_following = (await self.repo.get_follow(lst.id, user_id)) is not None
        if not self._can_add_item(lst, user_id, is_following):
            raise UnauthorizedError("You don't have permission to add items to this list")

        entity = await self.entity_repo.get_by_id(payload.entity_id)
        if not entity:
            raise NotFoundError("Entity not found")

        if await self.repo.item_exists(lst.id, entity.id):
            raise AlreadyExistsError("This item is already in the list")

        position = await self.repo.max_position(lst.id) + 1
        item = await self.repo.add_item(
            lst.id, entity.id, entity.entity_type, payload.note, position, added_by_user_id=user_id
        )
        await self.repo.touch(lst.id)
        await self.db.commit()

        return ListItemPublic(
            id=item.id,
            position=item.position,
            note=item.note,
            added_at=item.added_at,
            added_by_user_id=item.added_by_user_id,
            is_own=True,
            can_remove=True,
            entity=_entity_mini(entity),
        )

    async def _to_candidates(
        self, entities: list, list_nodes: list[GraphItem] | None = None, profile=None
    ) -> list[ListCandidate]:
        """`entities` as candidates; with the list's graph slice (`list_nodes`
        in display order) and profile each also gets a `reason`."""
        rows = await self.repo.graph_edges_for_entities([e.id for e in entities], GRAPH_RELATION_TYPES)
        nodes = _build_graph_items(entities, rows, await self._person_graph_data(entities))
        out = []
        for entity, node in zip(entities, nodes):
            reason = None
            if profile is not None:
                attrs = entity.attributes or {}
                r = explain_candidate(
                    node, list_nodes or [], profile, settings.list_graph_cast_depth,
                    country=attrs.get("country"),
                    rating=attrs.get("imdb_rating") or attrs.get("external_rating"),
                )
                reason = CandidateReason(strength=r.strength, kind=r.kind, text=r.text, score=r.score)
            out.append(ListCandidate(entity=_entity_mini(entity), reason=reason, **_item_graph_fields(entity, node)))
        return out

    async def get_candidates(
        self, user_id: uuid.UUID, slug: str, entity_type: str | None, q: str, limit: int
    ) -> list[ListCandidate]:
        """What the add-item form offers: title matches for `q`, or -- with
        an empty query -- suggestions drawn from the list's own graph (see
        suggest.py): people the items share or colleagues of the list's
        people, works those people are credited on, and well-ranked titles in
        the genres the list is made of. Each carries a `reason` saying how it
        connects. `entity_type` narrows either to one type; otherwise the
        suggestions stay within the types the list already holds. Items
        already in the list are never offered."""
        lst = await self.repo.get_detail_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")
        is_following = False
        if user_id != lst.user_id and lst.contribution_mode == ContributionMode.FOLLOWERS_ONLY:
            is_following = (await self.repo.get_follow(lst.id, user_id)) is not None
        if not self._can_add_item(lst, user_id, is_following):
            raise UnauthorizedError("You don't have permission to add items to this list")

        ordered = _display_order(lst)
        list_entities = [item.entity for item in ordered]
        in_list = {e.id for e in list_entities}
        cast_depth = settings.list_graph_cast_depth
        list_nodes = _build_graph_items(
            list_entities,
            await self.repo.graph_edges_for_entities(list(in_list), GRAPH_RELATION_TYPES),
            await self._person_graph_data(list_entities),
        )
        profile = build_profile(list_nodes, [(e.attributes or {}).get("country") for e in list_entities])

        if q.strip():
            found = await find_entities_by_title(self.db, q, entity_type, limit + len(in_list))
            return await self._to_candidates(
                [e for e in found if e.id not in in_list][:limit], list_nodes, profile
            )
        from_title = await self._title_hint_candidates(lst, entity_type, in_list, list_nodes, profile, limit)
        if not list_nodes:
            return from_title

        types = [entity_type] if entity_type else sorted({n.entity_type for n in list_nodes})
        people: set[uuid.UUID] = set()
        for node in list_nodes:
            if node.entity_type == "person":
                people.add(node.entity_id)
            else:
                people.update(p.id for p in [*node.makers(), *node.top_cast(cast_depth)])

        pool: dict[uuid.UUID, object] = {}

        def take(entities):
            for entity in entities:
                pool.setdefault(entity.id, entity)

        pool_size = settings.list_candidate_pool_size
        take(await self.repo.entities_linked_to_people(people, types, in_list, pool_size))
        if "person" in types:
            # Colleagues: whoever is credited on the works of the list's people
            # (or, for a list of titles, on the titles themselves).
            works: set[uuid.UUID] = set()
            for node in list_nodes:
                works.update(list(node.credits)[:400] if node.entity_type == "person" else [node.entity_id])
            take(await self.repo.co_credited_people(works, in_list, pool_size // 2))
        titled = [t for t in types if t != "person"]
        top_genres = {
            gid for gid, _ in sorted(profile.genre_weights.items(), key=lambda kv: -kv[1])[:3]
        }
        take(await self.repo.entities_with_genres(top_genres, titled, in_list, pool_size // 2))

        candidates = await self._to_candidates(list(pool.values()), list_nodes, profile)
        seen = {c.entity.id for c in from_title}
        scored = [c for c in candidates if c.reason and c.reason.strength > 0 and c.entity.id not in seen]
        scored.sort(key=lambda c: (-c.reason.score, c.entity.title))
        return (from_title + scored)[:limit]

    async def _resolve_title_people(self, phrases: list[str]) -> list:
        """People whose name the list title spells out: a full multi-word
        name («تیم برتون»), or a lone surname that only one person has
        («نولان»). Words of a matched name are not matched again."""
        people: list = []
        used: set[str] = set()
        for phrase in phrases:
            words = phrase.split()
            if used & set(words):
                continue
            found = await find_entities_by_title(self.db, phrase, "person", 8)
            names = [
                (p, {normalize(p.title), normalize((p.attributes or {}).get("title_fa") or "")} - {""})
                for p in found
            ]
            if len(words) > 1:
                hit = next((p for p, ns in names if phrase in ns), None)
            else:
                surnamed = [p for p, ns in names if any(n.split()[-1] == phrase for n in ns)]
                hit = surnamed[0] if len(surnamed) == 1 else None
            if hit:
                people.append(hit)
                used.update(words)
        return people

    async def _title_hint_candidates(
        self, lst, entity_type: str | None, in_list: set[uuid.UUID], list_nodes, profile, limit: int
    ) -> list[ListCandidate]:
        """Titles the list's own title asks for: «برترین فیلم‌های تیم برتون»
        -> his films; «بهترین موزیکال‌های دهه ۱۹۹۰» -> music/musical titles of
        that decade. Every constraint found in the title must hold, and these
        come ahead of the suggestions drawn from the items already added."""
        hints = parse_title_hints(lst.title)
        if not hints:
            return []
        people = await self._resolve_title_people(hints.phrases)
        genres = await self.repo.genres_by_title(hints.genres)
        if not (people or genres or hints.decade):
            return []
        if hints.decade and not (people or genres):
            # A decade alone is too loose («بهترین فیلم‌های دهه ۱۹۹۰» is every film).
            return []
        types = [entity_type] if entity_type else (
            [lst.entity_type] if lst.entity_type and lst.entity_type != "person"
            else sorted({n.entity_type for n in list_nodes if n.entity_type != "person"}) or ["movie", "tv_series"]
        )
        entities = await self.repo.entities_matching_hints(
            {p.id for p in people}, {g.id for g in genres}, hints.decade, types, in_list,
            settings.list_candidate_pool_size,
        )
        if not entities:
            return []
        labels = []
        if people:
            labels.append("، ".join((p.attributes or {}).get("title_fa") or p.title for p in people))
        labels += [f"ژانر {_GENRE_FA.get(g.title.lower(), g.title)}" for g in genres]
        if hints.decade:
            labels.append(f"دهه {str(hints.decade).translate(_FA_DIGITS)}")
        text = "مطابق عنوان فهرست: " + " · ".join(labels)
        out = await self._to_candidates(entities, list_nodes, profile)
        for c in out:
            base = c.reason.score if c.reason else 0.0
            c.reason = CandidateReason(strength=4, kind="title", text=text, score=base + 10)
        out.sort(key=lambda c: (-c.reason.score, c.entity.title))
        return out[:limit]

    async def remove_item(self, user_id: uuid.UUID, slug: str, item_id: uuid.UUID) -> None:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")

        item = await self.repo.get_item(lst.id, item_id)
        if not item:
            raise NotFoundError("Item not found in this list")

        is_owner = lst.user_id == user_id
        is_contributor = item.added_by_user_id == user_id
        if not (is_owner or is_contributor):
            raise UnauthorizedError("You don't have permission to remove this item")

        await self.repo.remove_item(item)
        await self.repo.touch(lst.id)
        await self.db.commit()

    async def reorder_items(self, user_id: uuid.UUID, slug: str, item_ids: list[uuid.UUID]) -> None:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")
        if lst.user_id != user_id:
            raise UnauthorizedError("You don't have permission to edit this list")

        await self.repo.reorder_items(lst.id, item_ids)
        await self.repo.touch(lst.id)
        await self.db.commit()

    # --- Item likes (community_ordered scoring) ---

    async def _recompute_item_score(self, item_id: uuid.UUID) -> tuple[float, int, int]:
        likes, dislikes = await self.repo.count_item_votes(item_id)
        score = compute_like_score(likes, dislikes)
        await self.repo.set_item_like_score(item_id, score)
        return score, likes, dislikes

    async def vote_item(
        self, user_id: uuid.UUID, slug: str, item_id: uuid.UUID, is_like: bool
    ) -> ListItemVoteResult:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")

        item = await self.repo.get_item(lst.id, item_id)
        if not item:
            raise NotFoundError("Item not found in this list")

        await self.repo.upsert_item_vote(item.id, user_id, is_like)
        score, likes, dislikes = await self._recompute_item_score(item.id)
        await self.db.commit()

        return ListItemVoteResult(like_score=score, like_count=likes, dislike_count=dislikes, my_vote=is_like)

    async def remove_item_vote(self, user_id: uuid.UUID, slug: str, item_id: uuid.UUID) -> ListItemVoteResult:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")

        item = await self.repo.get_item(lst.id, item_id)
        if not item:
            raise NotFoundError("Item not found in this list")

        existing = await self.repo.get_item_like(item.id, user_id)
        if existing:
            await self.repo.remove_item_vote(existing)

        score, likes, dislikes = await self._recompute_item_score(item.id)
        await self.db.commit()

        return ListItemVoteResult(like_score=score, like_count=likes, dislike_count=dislikes, my_vote=None)

    # --- Social: likes ---

    async def toggle_like(self, user_id: uuid.UUID, slug: str) -> bool:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")

        existing = await self.repo.get_like(lst.id, user_id)
        if existing:
            await self.repo.remove_like(existing)
            await self.db.commit()
            return False
        else:
            await self.repo.add_like(lst.id, user_id)
            await self.db.commit()
            return True

    # --- Social: follows ---

    async def toggle_follow(self, user_id: uuid.UUID, slug: str) -> bool:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")

        existing = await self.repo.get_follow(lst.id, user_id)
        if existing:
            await self.repo.remove_follow(existing)
            await self.db.commit()
            return False
        else:
            await self.repo.add_follow(lst.id, user_id)
            await self.db.commit()
            return True

    # --- Social: comments ---

    async def add_comment(self, user_id: uuid.UUID, slug: str, payload: CommentCreate) -> CommentPublic:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")

        comment = await self.repo.add_comment(lst.id, user_id, payload.body, payload.parent_comment_id)
        await ContributionStatsComputer(self.db).compute_contribution_stats(user_id)
        await self.db.commit()
        return CommentPublic.model_validate(comment)

    async def delete_comment(self, user_id: uuid.UUID, slug: str, comment_id: uuid.UUID) -> None:
        """The author can delete their comment; so can the list's owner (moderating their own list)."""
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")
        comment = await self.repo.get_comment(comment_id)
        if comment is None or comment.list_id != lst.id:
            raise NotFoundError("Comment not found")
        if user_id not in (comment.user_id, lst.user_id):
            raise ForbiddenError("You can only delete your own comments")

        author_id = comment.user_id
        await self.repo.delete_comment_thread(comment)
        await ContributionStatsComputer(self.db).compute_contribution_stats(author_id)
        await self.db.commit()

    async def list_comments(self, slug: str) -> list[CommentPublic]:
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")

        comments = await self.repo.list_comments(lst.id)
        return [CommentPublic.model_validate(c) for c in comments]

    # --- Related lists ---

    async def get_related_lists(self, slug: str) -> list[RelatedListSummary]:
        """Public lists that share items with this one (most shared first),
        topped up with lists sharing a tag. Every result carries its reason;
        a list with neither overlap isn't related and isn't returned."""
        lst = await self.repo.get_by_slug(slug)
        if not lst:
            raise NotFoundError(f"List '{slug}' not found")
        limit = settings.list_related_limit

        shared_counts = dict(await self.repo.lists_sharing_items(
            lst.id, [item.entity_id for item in lst.items], limit
        ))
        by_items = await self.repo.get_many_with_items(list(shared_counts))
        by_items.sort(key=lambda r: (-shared_counts[r.id], -r.like_count))

        own_tags = lst.tags or []
        by_tags = await self.repo.lists_sharing_tags(
            [lst.id, *shared_counts], own_tags, limit - len(by_items)
        )

        results = []
        for related in [*by_items, *by_tags]:
            summary = RelatedListSummary(**self._to_summary_with_preview(related).model_dump())
            summary.shared_item_count = shared_counts.get(related.id, 0)
            summary.shared_tag = next((t for t in own_tags if t in (related.tags or [])), None)
            results.append(summary)
        return results

    async def get_lists_containing_entity(self, entity_id: uuid.UUID) -> list[ListSummary]:
        lists = await self.repo.find_lists_containing_entity(entity_id)
        return [self._to_summary_with_preview(lst) for lst in lists]

    # --- Smart graph-based suggestions ---

    async def get_smart_suggestions(
        self, list_id: uuid.UUID, limit: int | None = None
    ) -> list[ListItemSuggestion]:
        limit = limit or settings.list_suggestion_limit
        entity_ids = await self.repo.list_item_entity_ids(list_id)
        if len(entity_ids) < 2:
            # Nothing to triangulate a shared relation from -- frontend
            # falls back to plain search.
            return []

        shared = await self.entity_repo.find_top_shared_relation(
            entity_ids, min_shared=settings.list_suggestion_min_shared_items
        )
        if not shared:
            return []

        priority_order = settings.list_suggestion_relation_priority.split(",")

        def priority_index(relation_type: str) -> int:
            try:
                return priority_order.index(relation_type)
            except ValueError:
                return len(priority_order)

        # Priority goes first (director/creator relations rank above
        # has_genre, which -- being shared by almost any pair of movies in
        # the same genre -- would otherwise always win on raw shared_count
        # and starve out cast/director-based suggestions entirely). Count
        # only breaks ties within the same priority tier.
        relation_type, target_id, target_title, shared_count = max(
            shared, key=lambda row: (-priority_index(row[0]), row[3])
        )

        candidates = await self.entity_repo.find_entities_by_relation(
            relation_type, target_id, exclude_ids=entity_ids, limit=limit
        )
        if not candidates:
            return []

        reason_label = RELATION_LABELS_FA.get(relation_type, RELATION_LABEL_FALLBACK_FA)
        return [
            ListItemSuggestion(
                entity=_entity_mini(c),
                reason=relation_type,
                reason_label_fa=f"{reason_label}: {target_title}",
            )
            for c in candidates
        ]