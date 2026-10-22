from datetime import datetime, time, timedelta

from sqlalchemy import case, desc, distinct, func, literal_column, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cached
from app.modules.admin.analytics_schemas import (
    AdminAnalytics, AnalyticsActivation, AnalyticsDailyBattle, AnalyticsDay, AnalyticsKpis, AnalyticsMetric,
    AnalyticsProvider, AnalyticsScoreCount, AnalyticsTopBattle, AnalyticsTopList, AnalyticsTopTitle,
    AnalyticsVotesBySource,
)
from app.modules.admin.dashboard_service import COMMENT_MODELS, VOTE_MODELS, _tehran_day
from app.modules.admin.users_service import _pct_change
from app.modules.battles.models import PairVote, VoteOutcome
from app.modules.battles.tournament_models import Battle, BattlePick, BattleVote
from app.modules.daily_battle.models import DailyBattle, DailyBattleVote
from app.modules.daily_battle.tehran import TEHRAN_TZ, tehran_today, utcnow
from app.modules.entities.models import Entity
from app.modules.lists.models import ListFollow, ListLike, UserList
from app.modules.users.models import User, UserRating
from app.modules.watch.models import WatchLink
from app.modules.watch.providers import PROVIDER_BY_KEY, PROVIDER_ORDER

RANGES = (7, 30, 90)
STATS_TTL_SECONDS = 120
TOP_LIMIT = 10

# Everything that counts as a user "doing something" (an account, not a guest).
ACTIVITY_MODELS = (*VOTE_MODELS, UserRating, *COMMENT_MODELS, UserList, ListLike, ListFollow)


def _activity(since: datetime):
    parts = []
    for model in ACTIVITY_MODELS:
        stmt = select(model.user_id.label("user_id"), model.created_at.label("at")).where(model.created_at >= since)
        if model is DailyBattleVote:
            stmt = stmt.where(model.user_id.is_not(None))
        if model is UserList:
            stmt = stmt.where(UserList.is_watch_later.is_(False))
        parts.append(stmt)
    return union_all(*parts).subquery("activity")


class AdminAnalyticsService:
    """Usage analytics over a 7/30/90-day range (/admin/analytics), built from
    what users did in the database. Page views live in the external
    Umami/Plausible script (components/Analytics.tsx), not here."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def analytics(self, days: int) -> AdminAnalytics:
        raw = await cached(("admin:analytics", days), STATS_TTL_SECONDS, lambda: self._load(days))
        return AdminAnalytics.model_validate(raw)

    async def _scalar(self, stmt) -> int:
        return (await self.db.execute(stmt)).scalar_one() or 0

    async def _metric(self, models, start: datetime, prev_start: datetime, *where) -> AnalyticsMetric:
        value = previous = 0
        for model in models:
            row = (
                await self.db.execute(
                    select(
                        func.count().filter(model.created_at >= start),
                        func.count().filter(model.created_at < start),
                    ).select_from(model).where(model.created_at >= prev_start, *where)
                )
            ).one()
            value += row[0]
            previous += row[1]
        return AnalyticsMetric(value=value, previous=previous, change_pct=_pct_change(value, previous))

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

    async def _top_chosen(self, start: datetime) -> list[AnalyticsTopTitle]:
        chosen = union_all(
            select(
                case((PairVote.winner == VoteOutcome.LEFT, PairVote.left_item), else_=PairVote.right_item)
                .label("entity_id")
            ).where(PairVote.winner != VoteOutcome.SKIP, PairVote.created_at >= start),
            select(BattlePick.winner_entity_id.label("entity_id")).where(BattlePick.created_at >= start),
            select(BattleVote.chosen_entity_id.label("entity_id")).where(BattleVote.created_at >= start),
            select(
                case((DailyBattleVote.choice == "left", DailyBattle.left_id), else_=DailyBattle.right_id)
                .label("entity_id")
            )
            .select_from(DailyBattleVote)
            .join(DailyBattle, DailyBattle.id == DailyBattleVote.daily_battle_id)
            .where(DailyBattleVote.created_at >= start),
        ).subquery("chosen")
        n = func.count().label("n")
        rows = await self.db.execute(
            select(Entity.id, Entity.title, Entity.slug, Entity.entity_type, n)
            .join(chosen, chosen.c.entity_id == Entity.id)
            .group_by(Entity.id)
            .order_by(desc("n"), Entity.title)
            .limit(TOP_LIMIT)
        )
        return [
            AnalyticsTopTitle(id=r.id, title=r.title, slug=r.slug, entity_type=r.entity_type, count=r.n)
            for r in rows.all()
        ]

    async def _top_rated(self, start: datetime) -> list[AnalyticsTopTitle]:
        n = func.count().label("n")
        rows = await self.db.execute(
            select(Entity.id, Entity.title, Entity.slug, Entity.entity_type, n, func.avg(UserRating.score).label("avg"))
            .join(UserRating, UserRating.entity_id == Entity.id)
            .where(UserRating.created_at >= start)
            .group_by(Entity.id)
            .order_by(desc("n"), Entity.title)
            .limit(TOP_LIMIT)
        )
        return [
            AnalyticsTopTitle(
                id=r.id, title=r.title, slug=r.slug, entity_type=r.entity_type, count=r.n,
                avg_score=round(float(r.avg), 2),
            )
            for r in rows.all()
        ]

    async def _top_lists(self, start: datetime) -> list[AnalyticsTopList]:
        reactions = union_all(
            select(ListLike.list_id.label("list_id"), literal_column("1").label("is_like"))
            .where(ListLike.created_at >= start),
            select(ListFollow.list_id.label("list_id"), literal_column("0").label("is_like"))
            .where(ListFollow.created_at >= start),
        ).subquery("reactions")
        likes = func.count().filter(reactions.c.is_like == 1).label("likes")
        follows = func.count().filter(reactions.c.is_like == 0).label("follows")
        rows = await self.db.execute(
            select(UserList.id, UserList.title, UserList.slug, User.username, likes, follows)
            .join(reactions, reactions.c.list_id == UserList.id)
            .join(User, User.id == UserList.user_id)
            .group_by(UserList.id, User.username)
            .order_by(desc(func.count()), UserList.title)
            .limit(TOP_LIMIT)
        )
        return [
            AnalyticsTopList(id=r.id, title=r.title, slug=r.slug, owner_username=r.username, likes=r.likes, follows=r.follows)
            for r in rows.all()
        ]

    async def _top_battles(self, start: datetime) -> list[AnalyticsTopBattle]:
        picks = func.count().label("picks")
        rows = await self.db.execute(
            select(Battle.id, Battle.title, Battle.slug, picks, func.count(distinct(BattlePick.user_id)).label("players"))
            .join(BattlePick, BattlePick.battle_id == Battle.id)
            .where(BattlePick.created_at >= start)
            .group_by(Battle.id)
            .order_by(desc("picks"), Battle.title)
            .limit(TOP_LIMIT)
        )
        return [AnalyticsTopBattle(id=r.id, title=r.title, slug=r.slug, picks=r.picks, players=r.players) for r in rows.all()]

    async def _providers(self) -> list[AnalyticsProvider]:
        rows = await self.db.execute(
            select(WatchLink.provider, func.count(), func.coalesce(func.sum(WatchLink.click_count), 0))
            .group_by(WatchLink.provider)
        )
        out = [
            AnalyticsProvider(
                provider=p, name=PROVIDER_BY_KEY[p].name if p in PROVIDER_BY_KEY else p, links=links, clicks=clicks,
            )
            for p, links, clicks in rows.all()
        ]
        return sorted(out, key=lambda p: (-p.clicks, PROVIDER_ORDER.get(p.provider, 99)))

    async def _load(self, days: int) -> dict:
        now = utcnow()
        today = tehran_today(now)
        first_day = today - timedelta(days=days - 1)
        start = datetime.combine(first_day, time.min, tzinfo=TEHRAN_TZ)
        prev_start = start - timedelta(days=days)
        live = User.deleted_at.is_(None)

        activity = _activity(prev_start)
        active = (
            await self.db.execute(
                select(
                    func.count(distinct(activity.c.user_id)).filter(activity.c.at >= start),
                    func.count(distinct(activity.c.user_id)).filter(activity.c.at < start),
                )
            )
        ).one()
        kpis = AnalyticsKpis(
            signups=await self._metric((User,), start, prev_start, live),
            active_users=AnalyticsMetric(value=active[0], previous=active[1], change_pct=_pct_change(active[0], active[1])),
            votes=await self._metric(VOTE_MODELS, start, prev_start),
            ratings=await self._metric((UserRating,), start, prev_start),
            comments=await self._metric(COMMENT_MODELS, start, prev_start),
            lists_created=await self._metric((UserList,), start, prev_start, UserList.is_watch_later.is_(False)),
            list_likes=await self._metric((ListLike,), start, prev_start),
            list_follows=await self._metric((ListFollow,), start, prev_start),
            battles_created=await self._metric((Battle,), start, prev_start, Battle.status != "draft"),
        )

        # New accounts that went on to do anything at all (at any time since signing up).
        ever = _activity(start)
        activated = await self._scalar(
            select(func.count(distinct(User.id)))
            .join(ever, ever.c.user_id == User.id)
            .where(live, User.created_at >= start)
        )
        signups = kpis.signups.value
        activation = AnalyticsActivation(
            signups=signups, activated=activated,
            rate_pct=round(activated / signups * 100, 1) if signups else None,
        )

        in_range = _activity(start)
        day = _tehran_day(in_range.c.at).label("day")
        active_by_day = dict(
            (await self.db.execute(select(day, func.count(distinct(in_range.c.user_id))).group_by(day))).all()
        )
        signups_by_day = await self._per_day((User,), start, live)
        votes_by_day = await self._per_day(VOTE_MODELS, start)
        ratings_by_day = await self._per_day((UserRating,), start)
        comments_by_day = await self._per_day(COMMENT_MODELS, start)
        series = []
        for i in range(days):
            d = first_day + timedelta(days=i)
            series.append(AnalyticsDay(
                date=d, signups=signups_by_day.get(d, 0), active_users=active_by_day.get(d, 0),
                votes=votes_by_day.get(d, 0), ratings=ratings_by_day.get(d, 0), comments=comments_by_day.get(d, 0),
            ))

        async def count(model, *where) -> int:
            return await self._scalar(select(func.count()).select_from(model).where(model.created_at >= start, *where))

        votes_by_source = AnalyticsVotesBySource(
            pair=await count(PairVote), pool=await count(BattlePick),
            bracket=await count(BattleVote), daily=await count(DailyBattleVote),
        )
        daily_battle = AnalyticsDailyBattle(
            member_votes=await count(DailyBattleVote, DailyBattleVote.user_id.is_not(None)),
            guest_votes=await count(DailyBattleVote, DailyBattleVote.user_id.is_(None)),
        )
        scores = dict(
            (
                await self.db.execute(
                    select(UserRating.score, func.count()).where(UserRating.created_at >= start).group_by(UserRating.score)
                )
            ).all()
        )

        return AdminAnalytics(
            days_count=days, start=first_day, end=today,
            kpis=kpis, activation=activation, days=series,
            votes_by_source=votes_by_source, daily_battle=daily_battle,
            rating_distribution=[AnalyticsScoreCount(score=s, count=scores.get(s, 0)) for s in range(1, 6)],
            top_chosen_titles=await self._top_chosen(start),
            top_rated_titles=await self._top_rated(start),
            top_lists=await self._top_lists(start),
            top_battles=await self._top_battles(start),
            watch_providers=await self._providers(),
            generated_at=now,
        ).model_dump(mode="json")
