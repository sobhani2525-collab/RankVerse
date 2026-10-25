"""Related battles and lists for a pool battle: everything that shares entries with it."""
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.entities.models import RelationshipEdge
from app.modules.lists.repository import ListRepository
from app.modules.lists.schemas import RelatedListSummary
from app.modules.lists.service import ListService

from . import tournament_views as views
from .tournament_models import Battle, BattleParticipant

CREDITS = ("directed_by", "creator", "acted_in")


async def _common_people(db: AsyncSession, title_ids: list[uuid.UUID]) -> list[uuid.UUID]:
    """People credited on at least half of the titles (and on two or more): the actor or director
    a pool like "Amin Hayaei's best films" is about."""
    hits = func.count(func.distinct(RelationshipEdge.from_entity_id))
    rows = await db.execute(
        select(RelationshipEdge.to_entity_id)
        .where(RelationshipEdge.from_entity_id.in_(title_ids), RelationshipEdge.relation_type.in_(CREDITS))
        .group_by(RelationshipEdge.to_entity_id)
        .having(hits >= max(2, (len(title_ids) + 1) // 2))
    )
    return list(rows.scalars())


async def related_for_pool(db: AsyncSession, battle: Battle, viewer_id: uuid.UUID | None, limit: int) -> dict:
    entity_ids = list(
        (await db.execute(select(BattleParticipant.entity_id).where(BattleParticipant.battle_id == battle.id))).scalars()
    )
    if not entity_ids:
        return {"winner": None, "battles": [], "lists": []}

    shared = func.count(func.distinct(BattleParticipant.entity_id))
    rows = (
        await db.execute(
            select(Battle, shared)
            .join(BattleParticipant, BattleParticipant.battle_id == Battle.id)
            .where(
                BattleParticipant.entity_id.in_(entity_ids),
                Battle.id != battle.id,
                Battle.mode == "pool",
                Battle.visibility == "public",
                Battle.status == "active",
                Battle.is_hidden_from_discovery.is_(False),
            )
            .group_by(Battle.id)
            .order_by(shared.desc(), Battle.created_at.desc())
            .limit(limit)
        )
    ).all()
    items = await views.battle_list_items(db, [b for b, _ in rows], viewer_id)
    for item, (_, count) in zip(items, rows):
        item["shared_count"] = count

    list_repo = ListRepository(db)
    nobody = uuid.uuid4()  # a random list id: exclude nothing
    counts = dict(await list_repo.lists_sharing_items(nobody, entity_ids, limit))
    # Lists holding the person the titles have in common (not a title, so not in shared_item_count).
    people = await _common_people(db, entity_ids) if battle.entity_type != "person" else []
    person_hits = dict(await list_repo.lists_sharing_items(nobody, people, limit))
    service = ListService(db)
    lists = []
    for lst in await list_repo.get_many_with_items(list(counts.keys() | person_hits.keys())):
        summary = RelatedListSummary(**service._to_summary_with_preview(lst).model_dump())
        summary.shared_item_count = counts.get(lst.id, 0)
        lists.append(summary)
    score = lambda s: s.shared_item_count + person_hits.get(s.id, 0)
    lists.sort(key=lambda s: (-score(s), -s.like_count))
    lists = lists[:limit]
    return {"winner": None, "battles": items, "lists": [s.model_dump() for s in lists]}
