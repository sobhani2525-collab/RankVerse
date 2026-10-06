import logging
import random
import uuid
from datetime import date, datetime, timedelta

from fastapi import HTTPException, status
from app.core.rate_limit import hit_local
from redis.asyncio import Redis
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.battles.models import EntityEloScore
from app.modules.battles.repository import BattleRepository
from app.modules.battles.schemas import CastVoteRequest, VoteOutcomeSchema
from app.modules.battles.service import BattleService
from app.modules.battles.themed import ThemedBattleService
from app.modules.entities.models import Entity, EntityRanking

from . import tehran
from .models import DailyBattle, DailyBattleVote
from .schemas import (
    DailyBattleToday,
    DailyFilm,
    DailyPrevious,
    DailyResults,
    DailyTheme,
)

logger = logging.getLogger(__name__)

CATEGORY = "movie"
DEFAULT_ELO = 1200.0
STREAK_LOOKBACK_DAYS = 60
MAX_SEED_ATTEMPTS = 12  # seed movies tried per auto-pick (each costs a few queries)
ELO_WINDOW_STEPS = (1, 2, 4, 8)  # multiples of daily_battle_elo_window, tried in order
GUEST_IP_KEY_TTL_SECONDS = 2 * 24 * 3600


def film_of(entity: Entity, score: float | None) -> DailyFilm:
    attrs = entity.attributes or {}
    year = attrs.get("year")
    return DailyFilm(
        id=entity.id,
        slug=entity.slug,
        title=entity.title,
        title_fa=attrs.get("title_fa"),
        poster_path=attrs.get("poster_path"),
        year=year if isinstance(year, int) else None,
        computed_score=score,
    )


def streak_from_dates(voted: set[date], today: date) -> int:
    """Consecutive voted days ending today -- or, when today is still open,
    ending yesterday, so an unvoted morning doesn't show a broken streak."""
    day = today if today in voted else today - timedelta(days=1)
    count = 0
    while day in voted:
        count += 1
        day -= timedelta(days=1)
    return count


class DailyBattleService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # -- lookup ------------------------------------------------------------

    async def get_by_date(self, battle_date: date) -> DailyBattle | None:
        result = await self.db.execute(select(DailyBattle).where(DailyBattle.battle_date == battle_date))
        return result.scalar_one_or_none()

    async def films(self, *entity_ids: uuid.UUID) -> dict[uuid.UUID, DailyFilm]:
        rows = await self.db.execute(
            select(Entity, EntityRanking.computed_score)
            .outerjoin(EntityRanking, EntityRanking.entity_id == Entity.id)
            .where(Entity.id.in_(entity_ids))
        )
        return {entity.id: film_of(entity, score) for entity, score in rows.all()}

    # -- lazy creation -----------------------------------------------------

    async def get_or_create_today(self, now: datetime | None = None) -> DailyBattle | None:
        """Today's battle, created by the first request of the day. Two servers
        racing to create it end up on the same row: the loser of the unique
        battle_date insert rolls its savepoint back and re-reads the winner."""
        today = tehran.tehran_today(now)
        existing = await self.get_by_date(today)
        if existing is not None:
            return existing

        pair = await self._pick_pair(today)
        if pair is None:
            return None
        left, right, kind, value = pair
        row = DailyBattle(
            battle_date=today, left_id=left.id, right_id=right.id,
            theme_kind=kind, theme_value=value, source="auto",
        )
        try:
            async with self.db.begin_nested():
                self.db.add(row)
                await self.db.flush()
        except IntegrityError:
            winner = await self.get_by_date(today)
            if winner is None:
                raise
            return winner
        await self.db.commit()
        return row

    # -- automatic pair selection ------------------------------------------

    async def _pick_pair(self, today: date) -> tuple[Entity, Entity, str, str] | None:
        """Seeded by the date so two servers picking at once agree. When the
        no-repeat rule leaves nothing, a repeat beats hiding the section."""
        recent = await self._recent_entity_ids(today)
        pair = await self._search_pair(random.Random(today.toordinal()), recent)
        if pair is None and recent:
            pair = await self._search_pair(random.Random(today.toordinal()), set())
        return pair

    async def _recent_entity_ids(self, today: date) -> set[uuid.UUID]:
        since = today - timedelta(days=settings.daily_battle_no_repeat_days)
        rows = await self.db.execute(
            select(DailyBattle.left_id, DailyBattle.right_id).where(DailyBattle.battle_date >= since)
        )
        return {entity_id for row in rows.all() for entity_id in row}

    async def _candidates(self, excluded: set[uuid.UUID]) -> list[Entity]:
        stmt = (
            select(Entity)
            .join(EntityRanking, EntityRanking.entity_id == Entity.id)
            .where(
                Entity.entity_type == CATEGORY,
                Entity.attributes["poster_path"].astext.isnot(None),
                Entity.attributes["title_fa"].astext.isnot(None),
                Entity.attributes["title_fa"].astext != "",
            )
            .order_by(EntityRanking.computed_score.desc().nulls_last(), Entity.id)
            .limit(settings.daily_battle_pool_size)
        )
        return [e for e in (await self.db.execute(stmt)).scalars().all() if e.id not in excluded]

    async def _elo_map(self, entity_ids: list[uuid.UUID]) -> dict[uuid.UUID, float]:
        rows = await self.db.execute(
            select(EntityEloScore.entity_id, EntityEloScore.elo_score).where(
                EntityEloScore.entity_id.in_(entity_ids), EntityEloScore.category == CATEGORY
            )
        )
        return {entity_id: score for entity_id, score in rows.all()}

    async def _search_pair(
        self, rng: random.Random, excluded: set[uuid.UUID]
    ) -> tuple[Entity, Entity, str, str] | None:
        candidates = await self._candidates(excluded)
        if len(candidates) < 2:
            return None
        order = list(candidates)
        rng.shuffle(order)

        themed = ThemedBattleService(self.db, CATEGORY)
        # (seed, theme, [(opponent, |elo gap|)]) for each seed theme that has at
        # least one eligible opponent.
        attempts = []
        for seed in order[:MAX_SEED_ATTEMPTS]:
            for theme in await themed._themes_for(seed, rng):
                members = [
                    m for m, _score in await themed._members(theme, exclude_id=seed.id)
                    if m.id not in excluded and (m.attributes or {}).get("title_fa")
                ]
                if not members:
                    continue
                elos = await self._elo_map([seed.id] + [m.id for m in members])
                seed_elo = elos.get(seed.id, DEFAULT_ELO)
                gaps = sorted(
                    ((m, abs(elos.get(m.id, DEFAULT_ELO) - seed_elo)) for m in members),
                    key=lambda pair: (pair[1], str(pair[0].id)),
                )
                attempts.append((seed, theme, gaps))

        for step in ELO_WINDOW_STEPS:
            window = settings.daily_battle_elo_window * step
            for seed, theme, gaps in attempts:
                close = [m for m, gap in gaps if gap <= window]
                if close:
                    return seed, rng.choice(close), theme.kind, theme.value
        if attempts:  # a themed pair, whatever the Elo gap
            seed, theme, gaps = attempts[0]
            return seed, gaps[0][0], theme.kind, theme.value
        # No shared theme anywhere: the two best candidates still make a pair.
        return order[0], order[1], "pair", ""

    # -- reading -----------------------------------------------------------

    @staticmethod
    def _voter_clause(user_id: uuid.UUID | None, guest_id: str | None):
        if user_id is not None:
            return DailyBattleVote.user_id == user_id
        return DailyBattleVote.guest_id == guest_id

    async def _my_choice(self, battle_id: uuid.UUID, user_id, guest_id) -> str | None:
        if user_id is None and not guest_id:
            return None
        result = await self.db.execute(
            select(DailyBattleVote.choice).where(
                DailyBattleVote.daily_battle_id == battle_id, self._voter_clause(user_id, guest_id)
            )
        )
        return result.scalar_one_or_none()

    async def _streak(self, user_id: uuid.UUID, today: date) -> int:
        since = today - timedelta(days=STREAK_LOOKBACK_DAYS)
        rows = await self.db.execute(
            select(DailyBattle.battle_date)
            .join(DailyBattleVote, DailyBattleVote.daily_battle_id == DailyBattle.id)
            .where(DailyBattleVote.user_id == user_id, DailyBattle.battle_date >= since)
        )
        return streak_from_dates({d for (d,) in rows.all()}, today)

    async def _previous(self, today: date) -> DailyPrevious | None:
        battle = await self.get_by_date(today - timedelta(days=1))
        if battle is None:
            return None
        films = await self.films(battle.left_id, battle.right_id)
        if battle.left_id not in films or battle.right_id not in films:
            return None
        if battle.left_votes == battle.right_votes:
            winner = "tie"
        else:
            winner = "left" if battle.left_votes > battle.right_votes else "right"
        return DailyPrevious(
            battle_date=battle.battle_date,
            left=films[battle.left_id], right=films[battle.right_id],
            left_votes=battle.left_votes, right_votes=battle.right_votes,
            total=battle.left_votes + battle.right_votes, winner=winner,
        )

    async def build_today(
        self, battle: DailyBattle, user_id: uuid.UUID | None, guest_id: str | None, now: datetime | None = None
    ) -> DailyBattleToday:
        today = tehran.tehran_today(now)
        films = await self.films(battle.left_id, battle.right_id)
        my_choice = await self._my_choice(battle.id, user_id, guest_id)
        results = None
        if my_choice is not None:
            # Re-read the counters so a vote just cast is included.
            await self.db.refresh(battle)
            results = DailyResults(
                left_votes=battle.left_votes, right_votes=battle.right_votes,
                total=battle.left_votes + battle.right_votes,
            )
        return DailyBattleToday(
            battle_date=battle.battle_date,
            daily_battle_id=battle.id,
            left=films[battle.left_id],
            right=films[battle.right_id],
            theme=DailyTheme(kind=battle.theme_kind, value=battle.theme_value),
            my_choice=my_choice,
            results=results,
            seconds_until_next=tehran.seconds_until_next_day(now),
            streak=await self._streak(user_id, today) if user_id is not None else None,
            previous=await self._previous(today),
        )

    async def today(self, user_id, guest_id, now: datetime | None = None) -> DailyBattleToday:
        battle = await self.get_or_create_today(now)
        if battle is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="نبردی برای امروز نیست")
        return await self.build_today(battle, user_id, guest_id, now)

    # -- voting ------------------------------------------------------------

    async def vote(
        self,
        daily_battle_id: uuid.UUID,
        choice: str,
        user_id: uuid.UUID | None,
        guest_id: str | None,
        ip: str | None,
        redis: Redis | None,
        now: datetime | None = None,
    ) -> DailyBattleToday:
        battle = await self.get_or_create_today(now)
        if battle is None or battle.id != daily_battle_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="این نبرد دیگر فعال نیست")
        if user_id is None and not guest_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="شناسهٔ مهمان نامعتبر است")

        # Already voted -> just report the current state, counting nothing
        # (and spending none of the guest's IP quota).
        if await self._my_choice(battle.id, user_id, guest_id) is None:
            if user_id is None:
                await self._enforce_guest_ip_limit(redis, ip, tehran.tehran_today(now))
            counted = await self._record_vote(battle, choice, user_id, guest_id)
            if counted and user_id is not None:
                await self._feed_elo(battle, choice, user_id)
        return await self.build_today(battle, user_id, guest_id, now)

    async def _record_vote(self, battle: DailyBattle, choice: str, user_id, guest_id) -> bool:
        """Insert the vote and bump the counter in one transaction; False when
        the voter had already voted (a concurrent duplicate hits the unique
        index)."""
        try:
            async with self.db.begin_nested():
                self.db.add(DailyBattleVote(
                    daily_battle_id=battle.id, choice=choice,
                    user_id=user_id, guest_id=None if user_id is not None else guest_id,
                ))
                await self.db.flush()
        except IntegrityError:
            return False
        column = DailyBattle.left_votes if choice == "left" else DailyBattle.right_votes
        await self.db.execute(
            update(DailyBattle).where(DailyBattle.id == battle.id).values({column.key: column + 1})
        )
        await self.db.commit()
        return True

    async def _feed_elo(self, battle: DailyBattle, choice: str, user_id: uuid.UUID) -> None:
        """A signed-in vote also counts as a regular battle vote. The day's vote
        is already committed, so a failure here (e.g. the 429 daily cap) must
        not lose it."""
        try:
            await BattleService(BattleRepository(self.db)).cast_vote(
                user_id,
                CastVoteRequest(
                    category=CATEGORY, left_item=battle.left_id, right_item=battle.right_id,
                    winner=VoteOutcomeSchema(choice),
                ),
            )
        except Exception as exc:  # noqa: BLE001 -- deliberately swallowed, see docstring
            logger.warning("daily battle %s: Elo update for user %s failed: %r", battle.id, user_id, exc)
            await self.db.rollback()

    async def _enforce_guest_ip_limit(self, redis: Redis | None, ip: str | None, today: date) -> None:
        if redis is None or not ip:
            return  # no IP to count (or no limiter wired in)
        key = f"dbv:{today.isoformat()}:{ip}"
        try:
            count = await redis.incr(key)
            if count == 1:
                await redis.expire(key, GUEST_IP_KEY_TTL_SECONDS)
        except Exception as exc:  # noqa: BLE001
            # Redis is optional: count in this process's memory instead (per
            # process and reset on restart, but the cap still holds).
            logger.warning("daily battle guest IP limit using in-process counter, Redis unavailable: %r", exc)
            count = hit_local(key, GUEST_IP_KEY_TTL_SECONDS)
        if count > settings.daily_battle_guest_ip_limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="تعداد رأی‌های امروز از این شبکه به سقف رسیده است. برای ادامه وارد حسابت شو.",
            )
