import logging
import uuid
from datetime import date, timedelta

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache
from app.core.exceptions import AlreadyExistsError, NotFoundError, ValidationError
from app.modules.admin.audit import AuditLogService, diff
from app.modules.admin.models import AdminAccount
from app.modules.entities.models import Entity

from . import tehran
from .models import DailyBattle
from .schemas import (
    AdminDailyBattleCreate,
    AdminDailyBattleRow,
    AdminDailyBattleUpdate,
    AdminThemeIn,
)
from .service import CATEGORY, DailyBattleService

logger = logging.getLogger(__name__)

WINDOW_DAYS = 14
DATE_TAKEN = "برای این تاریخ قبلاً نبردی ثبت شده است"


def _percent(part: int, total: int) -> int | None:
    return round(part * 100 / total) if total else None


class AdminDailyBattleService:
    """Planning and curation of the daily pair. Admin actions are recorded in
    the audit log (AuditLogService), like AdminListService's."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.daily = DailyBattleService(db)

    @staticmethod
    def _today() -> date:
        return tehran.tehran_today()

    async def _rows(self, battles: list[DailyBattle]) -> list[AdminDailyBattleRow]:
        ids = {i for b in battles for i in (b.left_id, b.right_id)}
        films = await self.daily.films(*ids) if ids else {}
        today = self._today()
        out = []
        for b in battles:
            total = b.left_votes + b.right_votes
            out.append(AdminDailyBattleRow(
                id=b.id, battle_date=b.battle_date,
                left=films[b.left_id], right=films[b.right_id],
                theme_kind=b.theme_kind, theme_value=b.theme_value, source=b.source,
                left_votes=b.left_votes, right_votes=b.right_votes, total=total,
                left_percent=_percent(b.left_votes, total),
                right_percent=_percent(b.right_votes, total),
                editable=b.battle_date >= today and total == 0,
                deletable=b.battle_date > today and total == 0,
            ))
        return out

    async def list(
        self, from_date: date | None, to_date: date | None, page: int, page_size: int
    ) -> tuple[list[AdminDailyBattleRow], int]:
        today = self._today()
        where = (
            DailyBattle.battle_date >= (from_date or today - timedelta(days=WINDOW_DAYS)),
            DailyBattle.battle_date <= (to_date or today + timedelta(days=WINDOW_DAYS)),
        )
        total = (await self.db.execute(select(func.count()).select_from(DailyBattle).where(*where))).scalar_one()
        battles = (
            await self.db.execute(
                select(DailyBattle).where(*where)
                .order_by(DailyBattle.battle_date.desc())
                .offset((page - 1) * page_size).limit(page_size)
            )
        ).scalars().all()
        return await self._rows(list(battles)), total

    async def _check_pair(self, left_id: uuid.UUID, right_id: uuid.UUID) -> None:
        if left_id == right_id:
            raise ValidationError("دو فیلم باید متفاوت باشند")
        types = dict(
            (await self.db.execute(select(Entity.id, Entity.entity_type).where(Entity.id.in_((left_id, right_id))))).all()
        )
        if len(types) != 2:
            raise NotFoundError("فیلم پیدا نشد")
        if any(t != CATEGORY for t in types.values()):
            raise ValidationError("نبرد روز فقط بین دو فیلم سینمایی است")

    @staticmethod
    def _theme(theme: AdminThemeIn | None) -> tuple[str, str]:
        return (theme.kind, theme.value.strip()) if theme else ("pair", "")

    async def create(
        self, admin: AdminAccount, payload: AdminDailyBattleCreate, request: Request | None = None
    ) -> AdminDailyBattleRow:
        if payload.battle_date < self._today():
            raise AlreadyExistsError("نمی‌شود برای روزهای گذشته نبرد گذاشت")
        if await self.daily.get_by_date(payload.battle_date) is not None:
            raise AlreadyExistsError(DATE_TAKEN)
        await self._check_pair(payload.left_id, payload.right_id)
        kind, value = self._theme(payload.theme)
        row = DailyBattle(
            battle_date=payload.battle_date, left_id=payload.left_id, right_id=payload.right_id,
            theme_kind=kind, theme_value=value, source="admin", created_by_admin_id=admin.id,
        )
        try:
            async with self.db.begin_nested():
                self.db.add(row)
                await self.db.flush()
        except IntegrityError:
            raise AlreadyExistsError(DATE_TAKEN)
        await AuditLogService(self.db).record(
            admin, "daily_battle.create", "daily_battle", row.id, after=self._snapshot(row), request=request
        )
        await self.db.commit()
        cache.clear()  # today's public part may be cached
        logger.info("admin %s scheduled daily battle %s for %s", admin.id, row.id, row.battle_date)
        return (await self._rows([row]))[0]

    @staticmethod
    def _snapshot(battle: DailyBattle) -> dict:
        return {
            "battle_date": battle.battle_date.isoformat(),
            "left_id": str(battle.left_id),
            "right_id": str(battle.right_id),
            "theme_kind": battle.theme_kind,
            "theme_value": battle.theme_value,
        }

    async def _locked(self, battle_id: uuid.UUID) -> DailyBattle:
        battle = (
            await self.db.execute(select(DailyBattle).where(DailyBattle.id == battle_id).with_for_update())
        ).scalar_one_or_none()
        if battle is None:
            raise NotFoundError("نبرد پیدا نشد")
        return battle

    async def update(
        self, admin: AdminAccount, battle_id: uuid.UUID, payload: AdminDailyBattleUpdate, request: Request | None = None
    ) -> AdminDailyBattleRow:
        battle = await self._locked(battle_id)
        if battle.left_votes + battle.right_votes > 0:
            raise AlreadyExistsError("این نبرد رأی دارد و دیگر قابل ویرایش نیست")
        today = self._today()
        if battle.battle_date < today:
            raise AlreadyExistsError("نبردِ روزهای گذشته قابل ویرایش نیست")

        new_date = payload.battle_date or battle.battle_date
        if new_date != battle.battle_date:
            if new_date < today:
                raise AlreadyExistsError("نمی‌شود نبرد را به روز گذشته برد")
            if await self.daily.get_by_date(new_date) is not None:
                raise AlreadyExistsError(DATE_TAKEN)
        left_id, right_id = payload.left_id or battle.left_id, payload.right_id or battle.right_id
        if (left_id, right_id) != (battle.left_id, battle.right_id):
            await self._check_pair(left_id, right_id)

        snapshot_before = self._snapshot(battle)
        battle.battle_date, battle.left_id, battle.right_id = new_date, left_id, right_id
        if "theme" in payload.model_fields_set:
            battle.theme_kind, battle.theme_value = self._theme(payload.theme)
        battle.source = "admin"
        battle.created_by_admin_id = admin.id
        try:
            await self.db.flush()
        except IntegrityError:
            await self.db.rollback()
            raise AlreadyExistsError(DATE_TAKEN)
        changed_before, changed_after = diff(snapshot_before, self._snapshot(battle))
        if changed_after:
            await AuditLogService(self.db).record(
                admin, "daily_battle.update", "daily_battle", battle_id,
                before=changed_before, after=changed_after, request=request,
            )
        await self.db.commit()
        cache.clear()
        logger.info(
            "admin %s edited daily battle %s: %s",
            admin.id, battle_id, payload.model_dump(exclude_unset=True, mode="json"),
        )
        return (await self._rows([battle]))[0]

    async def delete(self, admin: AdminAccount, battle_id: uuid.UUID, request: Request | None = None) -> None:
        battle = await self._locked(battle_id)
        if battle.battle_date <= self._today():
            raise AlreadyExistsError("فقط نبردهای روزهای آینده قابل حذف‌اند")
        if battle.left_votes + battle.right_votes > 0:
            raise AlreadyExistsError("این نبرد رأی دارد و قابل حذف نیست")
        await AuditLogService(self.db).record(
            admin, "daily_battle.delete", "daily_battle", battle_id, before=self._snapshot(battle), request=request
        )
        await self.db.delete(battle)
        await self.db.commit()
        cache.clear()
        logger.info("admin %s DELETED daily battle %s (%s)", admin.id, battle_id, battle.battle_date)
