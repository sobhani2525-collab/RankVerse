"""Related battles and lists for a pool battle: everything that shares entries with it."""
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.lists.repository import ListRepository
from app.modules.lists.schemas import RelatedListSummary
from app.modules.lists.service import ListService

from . import tournament_views as views
from .tournament_models import Battle, BattleParticipant


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
    pairs = await list_repo.lists_sharing_items(uuid.uuid4(), entity_ids, limit)  # a random id: exclude nothing
    counts = dict(pairs)
    service = ListService(db)
    lists = []
    for lst in await list_repo.get_many_with_items(list(counts)):
        summary = RelatedListSummary(**service._to_summary_with_preview(lst).model_dump())
        summary.shared_item_count = counts[lst.id]
        lists.append(summary)
    lists.sort(key=lambda s: (-s.shared_item_count, -s.like_count))
    return {"winner": None, "battles": items, "lists": [s.model_dump() for s in lists]}
