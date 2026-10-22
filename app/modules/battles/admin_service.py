"""
Admin curation of user-made battles, modelled on the featured-lists curation
(app/modules/admin/service.py): pick which battles are featured and in what order
(one of them plays on the home page), hide spam from discovery, mark a battle
official (it then counts in full for the ranking score) and archive it. Nothing is
ever hard-deleted here, so links and results keep working.
"""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.admin.audit import AuditLogService, diff
from app.modules.admin.models import AdminAccount
from app.modules.users.models import User

from .admin_schemas import AdminBattleRow, AdminBattleUpdate
from .tournament_models import Battle, BattleFollow, BattlePick

logger = logging.getLogger(__name__)


def _players():
    return (
        select(func.count(func.distinct(BattlePick.user_id)))
        .where(BattlePick.battle_id == Battle.id)
        .correlate(Battle)
        .scalar_subquery()
    )


def _followers():
    return (
        select(func.count())
        .select_from(BattleFollow)
        .where(BattleFollow.battle_id == Battle.id)
        .correlate(Battle)
        .scalar_subquery()
    )


def _row(battle: Battle, creator_username: str | None, players: int, followers: int) -> AdminBattleRow:
    return AdminBattleRow(
        id=battle.id, slug=battle.slug, title=battle.title, creator_username=creator_username,
        entity_type=battle.entity_type, mode=battle.mode, bracket_size=battle.bracket_size,
        status=battle.status, visibility=battle.visibility, is_official=battle.is_official,
        is_featured=battle.is_featured, featured_order=battle.featured_order,
        is_hidden_from_discovery=battle.is_hidden_from_discovery, curation_note=battle.curation_note,
        players_count=players, follower_count=followers, created_at=battle.created_at,
    )


def _curation(battle: Battle) -> dict:
    return {
        "is_featured": battle.is_featured,
        "featured_order": battle.featured_order,
        "is_hidden_from_discovery": battle.is_hidden_from_discovery,
        "is_official": battle.is_official,
        "curation_note": battle.curation_note,
        "status": battle.status,
    }


class AdminBattleService:
    def __init__(self, db: AsyncSession):
        self.db = db

    def _select(self):
        return (
            select(Battle, User.username, _players().label("players"), _followers().label("followers"))
            .outerjoin(User, User.id == Battle.creator_id)
        )

    async def _one(self, battle_id: uuid.UUID) -> AdminBattleRow | None:
        row = (await self.db.execute(self._select().where(Battle.id == battle_id))).first()
        return _row(*row) if row else None

    async def search(
        self, *, q: str | None, featured: bool | None, hidden: bool | None, official: bool | None,
        status: str | None, mode: str, sort: str, page: int, page_size: int,
    ) -> tuple[list[AdminBattleRow], int]:
        conditions = [Battle.mode == mode, Battle.status != "draft"]
        if q:
            like = f"%{q.strip()}%"
            conditions.append(or_(Battle.title.ilike(like), User.username.ilike(like)))
        if featured is not None:
            conditions.append(Battle.is_featured.is_(featured))
        if hidden is not None:
            conditions.append(Battle.is_hidden_from_discovery.is_(hidden))
        if official is not None:
            conditions.append(Battle.is_official.is_(official))
        if status:
            conditions.append(Battle.status == status)

        total = (
            await self.db.execute(
                select(func.count()).select_from(Battle).outerjoin(User, User.id == Battle.creator_id).where(*conditions)
            )
        ).scalar_one()
        stmt = self._select().where(*conditions)
        if sort == "popular":
            stmt = stmt.order_by(_players().desc(), Battle.created_at.desc())
        elif sort == "followed":
            stmt = stmt.order_by(_followers().desc(), Battle.created_at.desc())
        else:
            stmt = stmt.order_by(Battle.created_at.desc())
        rows = (await self.db.execute(stmt.offset((page - 1) * page_size).limit(page_size))).all()
        return [_row(*r) for r in rows], total

    async def featured(self) -> list[AdminBattleRow]:
        stmt = (
            self._select()
            .where(Battle.is_featured.is_(True))
            .order_by(Battle.featured_order.asc().nulls_last(), Battle.featured_at.desc().nulls_last())
        )
        return [_row(*r) for r in (await self.db.execute(stmt)).all()]

    async def _max_featured_order(self) -> int:
        return (
            await self.db.execute(
                select(func.coalesce(func.max(Battle.featured_order), -1)).where(Battle.is_featured.is_(True))
            )
        ).scalar_one()

    async def update(
        self, admin: AdminAccount, battle_id: uuid.UUID, payload: AdminBattleUpdate, request: Request | None = None
    ) -> AdminBattleRow:
        battle = await self.db.get(Battle, battle_id)
        if battle is None or battle.status == "draft":
            raise NotFoundError("Battle not found")
        before = _curation(battle)
        fields = payload.model_fields_set

        if payload.is_featured is True and not battle.is_featured:
            # only a public, running winner-stays battle can play on the home page
            if battle.mode != "pool" or battle.visibility != "public" or battle.status != "active":
                raise ValidationError("Only a public, active winner-stays battle can be featured")
            battle.is_featured = True
            battle.featured_at = datetime.now(timezone.utc)
            battle.curated_by_admin_id = admin.id
            battle.featured_order = (
                payload.featured_order if payload.featured_order is not None else await self._max_featured_order() + 1
            )
        elif payload.is_featured is False and battle.is_featured:
            battle.is_featured = False
            battle.featured_at = None
            battle.featured_order = None
            battle.curated_by_admin_id = admin.id
        elif payload.featured_order is not None and battle.is_featured:
            battle.featured_order = payload.featured_order

        if payload.is_hidden_from_discovery is not None:
            battle.is_hidden_from_discovery = payload.is_hidden_from_discovery
            battle.curated_by_admin_id = admin.id
        if payload.is_official is not None:
            battle.is_official = payload.is_official
            battle.curated_by_admin_id = admin.id
        if "curation_note" in fields:
            battle.curation_note = (payload.curation_note or "").strip() or None

        await self.db.flush()
        changed_before, changed_after = diff(before, _curation(battle))
        if changed_after:
            await AuditLogService(self.db).record(
                admin, "battle.update", "battle", battle_id, before=changed_before, after=changed_after, request=request
            )
        await self.db.commit()
        logger.info("admin %s curated battle %s: %s", admin.id, battle_id, payload.model_dump(exclude_unset=True))
        return await self._one(battle_id)

    async def archive(self, admin: AdminAccount, battle_id: uuid.UUID, request: Request | None = None) -> AdminBattleRow:
        battle = await self.db.get(Battle, battle_id)
        if battle is None or battle.status == "draft":
            raise NotFoundError("Battle not found")
        before = _curation(battle)
        battle.status = "archived"
        battle.visibility = "unlisted"
        battle.is_featured = False
        battle.featured_at = None
        battle.featured_order = None
        battle.curated_by_admin_id = admin.id
        changed_before, changed_after = diff(before, _curation(battle))
        await AuditLogService(self.db).record(
            admin, "battle.archive", "battle", battle_id, before=changed_before, after=changed_after, request=request
        )
        await self.db.commit()
        logger.info("admin %s archived battle %s", admin.id, battle_id)
        return await self._one(battle_id)

    async def reorder_featured(
        self, admin: AdminAccount, ids: list[uuid.UUID], request: Request | None = None
    ) -> list[AdminBattleRow]:
        featured = {b.id: b for b in (await self.db.execute(select(Battle).where(Battle.is_featured.is_(True)))).scalars()}
        if any(i not in featured for i in ids):
            raise ValidationError("Every id must be a currently featured battle")
        ordered = sorted(featured.values(), key=lambda b: (b.featured_order is None, b.featured_order or 0))
        # listed ids take positions 0..n-1 in the given order; any featured battle left out follows them
        listed = set(ids)
        rest = [b.id for b in ordered if b.id not in listed]
        for position, battle_id in enumerate([*ids, *rest]):
            featured[battle_id].featured_order = position
        await AuditLogService(self.db).record(
            admin, "battle.featured_reorder", "battle", "featured", after={"ids": [str(i) for i in ids]}, request=request
        )
        await self.db.commit()
        logger.info("admin %s reordered featured battles: %s", admin.id, [str(i) for i in ids])
        return await self.featured()
