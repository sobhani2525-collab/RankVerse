from datetime import datetime, time, timedelta

from sqlalchemy import Date, cast, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cached
from app.modules.admin.dashboard_schemas import (
    AdminDashboardStats, DashboardBattles, DashboardCatalog, DashboardDailyBattle, DashboardDay, DashboardInbox,
    DashboardLists, DashboardTrend, DashboardUsers,
)
from app.modules.admin.users_service import _pct_change
from app.modules.alerts.models import AdminAlert
from app.modules.battles.models import PairVote
from app.modules.battles.tournament_models import Battle, BattlePick, BattleVote
from app.modules.contact.models import ContactMessage
from app.modules.daily_battle.models import DailyBattle, DailyBattleVote
from app.modules.daily_battle.tehran import TEHRAN_TZ, tehran_today, utcnow
from app.modules.entities.models import Entity, EntityComment
from app.modules.lists.models import ListComment, UserList
from app.modules.users.models import User, UserRating

STATS_TTL_SECONDS = 60
STATS_CACHE_KEY = "admin:dashboard:stats"
TREND_DAYS = 30

VOTE_MODELS = (PairVote, BattlePick, BattleVote, DailyBattleVote)
COMMENT_MODELS = (EntityComment, ListComment)


def _tehran_day(column):
    # Literal SQL only (no bound parameters), so the same expression in SELECT
    # and GROUP BY renders identically.
    return cast(
        func.timezone(literal_column("'UTC'"), column) + literal_column("interval '3 hours 30 minutes'"), Date
    )


class AdminDashboardService:
    """Platform-wide numbers for the admin dashboard (/admin/dashboard):
    a 60s cache per worker, since every card is a full-table count."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def stats(self) -> AdminDashboardStats:
        raw = await cached(STATS_CACHE_KEY, STATS_TTL_SECONDS, self._load)
        return AdminDashboardStats.model_validate(raw)

    async def _one(self, stmt) -> dict:
        return dict((await self.db.execute(stmt)).one()._mapping)

    async def _trend(self, models, d7: datetime, d14: datetime) -> dict[str, int]:
        out = {"total": 0, "last_7d": 0, "prev_7d": 0}
        for model in models:
            row = await self._one(
                select(
                    func.count().label("total"),
                    func.count().filter(model.created_at >= d7).label("last_7d"),
                    func.count().filter(model.created_at >= d14, model.created_at < d7).label("prev_7d"),
                ).select_from(model)
            )
            for k in out:
                out[k] += row[k]
        return out

    async def _per_day(self, models, since: datetime, *where) -> dict:
        out: dict = {}
        for model in models:
            day = _tehran_day(model.created_at).label("day")
            rows = await self.db.execute(
                select(day, func.count()).select_from(model).where(model.created_at >= since, *where).group_by(day)
            )
            for d, n in rows.all():
                out[d] = out.get(d, 0) + n
        return out

    async def _load(self) -> dict:
        now = utcnow()
        today = tehran_today(now)
        day_start = datetime.combine(today, time.min, tzinfo=TEHRAN_TZ)
        d7, d14 = now - timedelta(days=7), now - timedelta(days=14)

        live = User.deleted_at.is_(None)
        users = await self._one(
            select(
                func.count().filter(live).label("total"),
                func.count().filter(live, User.created_at >= d7).label("new_7d"),
                func.count().filter(live, User.created_at >= d14, User.created_at < d7).label("prev_7d"),
                func.count().filter(live, User.last_login_at >= day_start).label("active_today"),
                func.count().filter(live, User.last_login_at >= d7).label("active_7d"),
            ).select_from(User)
        )
        catalog = await self._one(
            select(
                func.count().filter(Entity.entity_type == "movie").label("movies"),
                func.count().filter(Entity.entity_type == "tv_series").label("tv_series"),
                func.count().filter(Entity.entity_type == "person").label("people"),
            ).select_from(Entity)
        )
        lists = await self._one(
            select(
                func.count().label("total"),
                func.count().filter(UserList.visibility == "public").label("public"),
                func.count().filter(UserList.created_at >= d7).label("new_7d"),
            ).select_from(UserList).where(UserList.is_watch_later.is_(False))
        )
        battles = await self._one(
            select(
                func.count().label("total"),
                func.count().filter(Battle.status == "active").label("active"),
                func.count().filter(Battle.created_at >= d7).label("new_7d"),
            ).select_from(Battle).where(Battle.status != "draft")
        )
        inbox = await self._one(
            select(
                select(func.count()).select_from(ContactMessage)
                .where(ContactMessage.status == "new").scalar_subquery().label("new_messages"),
                select(func.count()).select_from(AdminAlert)
                .where(AdminAlert.resolved_at.is_(None)).scalar_subquery().label("open_alerts"),
                select(func.count()).select_from(AdminAlert)
                .where(AdminAlert.resolved_at.is_(None), AdminAlert.severity == "critical")
                .scalar_subquery().label("critical_alerts"),
            )
        )
        daily = (
            await self.db.execute(
                select(DailyBattle.left_votes + DailyBattle.right_votes).where(DailyBattle.battle_date == today)
            )
        ).scalar_one_or_none()

        votes = await self._trend(VOTE_MODELS, d7, d14)
        ratings = await self._trend((UserRating,), d7, d14)
        comments = await self._trend(COMMENT_MODELS, d7, d14)

        first_day = today - timedelta(days=TREND_DAYS - 1)
        since = datetime.combine(first_day, time.min, tzinfo=TEHRAN_TZ)
        signups_by_day = await self._per_day((User,), since, live)
        votes_by_day = await self._per_day(VOTE_MODELS, since)
        ratings_by_day = await self._per_day((UserRating,), since)
        comments_by_day = await self._per_day(COMMENT_MODELS, since)
        days = []
        for i in range(TREND_DAYS):
            d = first_day + timedelta(days=i)
            days.append(DashboardDay(
                date=d, signups=signups_by_day.get(d, 0), votes=votes_by_day.get(d, 0),
                ratings=ratings_by_day.get(d, 0), comments=comments_by_day.get(d, 0),
            ))

        def trend(raw: dict) -> DashboardTrend:
            return DashboardTrend(
                total=raw["total"], last_7d=raw["last_7d"], change_pct=_pct_change(raw["last_7d"], raw["prev_7d"])
            )

        return AdminDashboardStats(
            users=DashboardUsers(
                total=users["total"], new_7d=users["new_7d"],
                new_7d_change_pct=_pct_change(users["new_7d"], users["prev_7d"]),
                active_today=users["active_today"], active_7d=users["active_7d"],
            ),
            catalog=DashboardCatalog(**catalog),
            lists=DashboardLists(**lists),
            battles=DashboardBattles(**battles),
            votes=trend(votes), ratings=trend(ratings), comments=trend(comments),
            inbox=DashboardInbox(**inbox),
            daily_battle=DashboardDailyBattle(scheduled_today=daily is not None, votes_today=daily or 0),
            days=days,
            generated_at=now,
        ).model_dump(mode="json")
