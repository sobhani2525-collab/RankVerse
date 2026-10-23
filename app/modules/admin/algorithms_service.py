import uuid
from dataclasses import asdict
from datetime import timedelta

from fastapi import Request
from sqlalchemy import Integer, cast, distinct, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import NotFoundError
from app.core.rate_limit import enforce
from app.modules.admin.algorithms_schemas import (
    AlgorithmParam, AlgorithmsHealth, DriftReport, DriftRow, RankingTypeHealth, RecomputeResult, ScoreBreakdownOut,
    ScoreExplanation, TasteHealth, TitleRef,
)
from app.modules.admin.audit import AuditLogService
from app.modules.admin.models import AdminAccount
from app.modules.battles import elo
from app.modules.battles.models import EntityEloScore
from app.modules.daily_battle.tehran import utcnow
from app.modules.entities.detail_cache import invalidate_title_detail
from app.modules.entities.models import Entity, EntityRanking
from app.modules.ranking.service import RankingService
from app.modules.taste.models import UserContributionStats, UserTasteSnapshot
from app.modules.users.models import UserRating

TITLE_TYPES = ("movie", "tv_series")
DRIFT_SAMPLE = 300  # most-voted titles checked against the formula
DRIFT_ROWS = 15
DRIFT_EPSILON = 0.009  # scores are stored rounded to 2 decimals
SEARCH_LIMIT = 10
RECOMPUTE_RATE_LIMIT = 20
RECOMPUTE_RATE_WINDOW_SECONDS = 10 * 60

# Settings read by the scoring code, by group (see app/config.py for what each does).
SETTING_GROUPS: dict[str, tuple[str, ...]] = {
    "ranking": (
        "ranking_min_votes", "ranking_user_weight", "ranking_external_weight", "ranking_external_prior",
        "ranking_imdb_min_votes", "ranking_tmdb_min_votes", "ranking_battle_weight", "ranking_battle_min_matches",
        "ranking_group_min_size",
    ),
    "taste": (
        "taste_dimension_confidence_k", "taste_dimension_rating_weight", "taste_dimension_engagement_weight",
        "taste_dimension_confidence_threshold", "taste_favorite_rating_equivalent",
        "taste_battle_win_rating_equivalent", "taste_anchor_min_rating", "taste_anchor_rating_weight",
        "taste_anchor_centrality_weight", "taste_anchor_max_count", "taste_snapshot_confidence_k",
        "taste_snapshot_dimension_weight", "taste_snapshot_vote_weight", "taste_contribution_vote_weight",
        "taste_contribution_battle_weight", "taste_contribution_comment_weight", "taste_contribution_favorite_weight",
        "taste_predicted_picks_dimension_weight", "taste_predicted_picks_ranking_weight",
    ),
    "lists": (
        "list_item_score_k", "list_item_score_global_avg", "list_discovery_min_items",
        "list_discovery_min_title_length", "list_active_min_contributors",
    ),
    "daily_battle": (
        "daily_battle_pool_size", "daily_battle_elo_window", "daily_battle_no_repeat_days",
        "daily_battle_guest_ip_limit",
    ),
}
# Code constants (battles/elo.py): changing them is a code change.
ELO_CONSTANTS = ("K_FACTOR_PROVISIONAL", "K_FACTOR_ESTABLISHED", "PROVISIONAL_THRESHOLD")


def _title_ref(e: Entity) -> TitleRef:
    attrs = e.attributes or {}
    year = attrs.get("year")
    return TitleRef(
        id=e.id, entity_type=e.entity_type, title=e.title, title_fa=attrs.get("title_fa") or None, slug=e.slug,
        year=year if isinstance(year, int) else None,
    )


class AdminAlgorithmsService:
    """The ranking formula, Elo and Taste DNA from the admin side
    (/admin/algorithms): their parameters, how healthy the stored scores
    are, and a step-by-step "why this score?" for one title. Scores come
    from RankingService.score_breakdowns, the same code that stores them."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.ranking = RankingService(db)

    # --- parameters -----------------------------------------------------

    @staticmethod
    def params() -> list[AlgorithmParam]:
        out = [
            AlgorithmParam(group=group, key=key, env=key.upper(), value=getattr(settings, key))
            for group, keys in SETTING_GROUPS.items()
            for key in keys
        ]
        out += [AlgorithmParam(group="elo", key=name, env=None, value=getattr(elo, name)) for name in ELO_CONSTANTS]
        return out

    # --- health ---------------------------------------------------------

    async def health(self) -> AlgorithmsHealth:
        now = utcnow()
        has_battles = exists(
            select(EntityEloScore.id).where(
                EntityEloScore.entity_id == Entity.id,
                EntityEloScore.category == Entity.entity_type,
                EntityEloScore.matches_played > 0,
            )
        )
        rows = await self.db.execute(
            select(
                Entity.entity_type,
                func.count().label("total"),
                func.count(EntityRanking.computed_score).label("ranked"),
                func.count().filter(EntityRanking.total_votes > 0).label("with_user_votes"),
                func.count().filter(has_battles).label("with_battles"),
                func.max(EntityRanking.updated_at).label("last"),
                func.min(EntityRanking.updated_at).label("oldest"),
            )
            .outerjoin(EntityRanking, EntityRanking.entity_id == Entity.id)
            .where(Entity.entity_type.in_(TITLE_TYPES))
            .group_by(Entity.entity_type)
        )
        by_type = {r.entity_type: r for r in rows.all()}

        bucket = func.least(func.greatest(cast(func.floor(EntityRanking.computed_score), Integer), 0), 9).label("b")
        hist_rows = await self.db.execute(
            select(Entity.entity_type, bucket, func.count())
            .join(EntityRanking, EntityRanking.entity_id == Entity.id)
            .where(Entity.entity_type.in_(TITLE_TYPES), EntityRanking.computed_score.is_not(None))
            .group_by(Entity.entity_type, bucket)
        )
        histograms = {t: [0] * 10 for t in TITLE_TYPES}
        for t, b, n in hist_rows.all():
            histograms[t][b] = n

        types = []
        for t in TITLE_TYPES:
            r = by_type.get(t)
            types.append(RankingTypeHealth(
                entity_type=t, total=r.total if r else 0, ranked=r.ranked if r else 0,
                with_user_votes=r.with_user_votes if r else 0, with_battles=r.with_battles if r else 0,
                histogram=histograms[t], last_recompute_at=r.last if r else None, oldest_recompute_at=r.oldest if r else None,
            ))

        ratings_total, platform_avg = (
            await self.db.execute(select(func.count(), func.avg(UserRating.score)))
        ).one()
        elo_row = (
            await self.db.execute(
                select(func.count(), func.max(EntityEloScore.elo_score), func.min(EntityEloScore.elo_score))
                .where(EntityEloScore.matches_played > 0)
            )
        ).one()
        taste = (
            await self.db.execute(
                select(
                    func.count(distinct(UserTasteSnapshot.user_id)),
                    func.avg(UserTasteSnapshot.model_confidence),
                    func.count().filter(UserTasteSnapshot.computed_at >= now - timedelta(days=7)),
                    func.max(UserTasteSnapshot.computed_at),
                )
            )
        ).one()
        contribution_rows = (await self.db.execute(select(func.count()).select_from(UserContributionStats))).scalar_one()

        return AlgorithmsHealth(
            types=types,
            ratings_total=ratings_total,
            platform_avg=round(float(platform_avg), 3) if platform_avg is not None else None,
            elo_entities=elo_row[0], elo_max=elo_row[1], elo_min=elo_row[2],
            taste=TasteHealth(
                users_with_snapshot=taste[0],
                avg_confidence=round(float(taste[1]), 3) if taste[1] is not None else None,
                computed_7d=taste[2], last_computed_at=taste[3], contribution_rows=contribution_rows,
            ),
            generated_at=now,
        )

    # --- one title ------------------------------------------------------

    async def search(self, q: str) -> list[TitleRef]:
        pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        votes = cast(Entity.attributes["external_vote_count"].astext, Integer)
        rows = await self.db.execute(
            select(Entity)
            .where(
                Entity.entity_type.in_(TITLE_TYPES),
                or_(Entity.title.ilike(pattern, escape="\\"), Entity.attributes["title_fa"].astext.ilike(pattern, escape="\\")),
            )
            .order_by(votes.desc().nulls_last(), Entity.title)
            .limit(SEARCH_LIMIT)
        )
        return [_title_ref(e) for e in rows.scalars().all()]

    async def _title(self, entity_id: uuid.UUID) -> Entity:
        entity = await self.db.get(Entity, entity_id)
        if entity is None or entity.entity_type not in TITLE_TYPES:
            raise NotFoundError("Title not found")
        return entity

    async def explain(self, entity_id: uuid.UUID) -> ScoreExplanation:
        entity = await self._title(entity_id)
        breakdown = (await self.ranking.score_breakdowns([entity]))[entity.id]
        stored = await self.db.get(EntityRanking, entity.id)
        return ScoreExplanation(
            title=_title_ref(entity),
            stored_score=stored.computed_score if stored else None,
            stored_at=stored.updated_at if stored else None,
            breakdown=ScoreBreakdownOut(**asdict(breakdown)),
        )

    # --- drift ----------------------------------------------------------

    async def drift(self) -> DriftReport:
        """Recompute (without saving) the most-voted titles and list those whose
        stored score no longer matches: new ratings, IMDb refreshes or battles
        since their last recompute."""
        votes = cast(Entity.attributes["external_vote_count"].astext, Integer)
        entities = (
            await self.db.execute(
                select(Entity).where(Entity.entity_type.in_(TITLE_TYPES))
                .order_by(votes.desc().nulls_last()).limit(DRIFT_SAMPLE)
            )
        ).scalars().all()
        breakdowns = await self.ranking.score_breakdowns(list(entities))
        stored = {
            r.entity_id: r.computed_score
            for r in (
                await self.db.execute(select(EntityRanking).where(EntityRanking.entity_id.in_([e.id for e in entities])))
            ).scalars().all()
        }
        drifted = []
        for e in entities:
            now_score = breakdowns[e.id].final
            old = stored.get(e.id)
            if old is None or abs(old - now_score) > DRIFT_EPSILON:
                drifted.append(DriftRow(title=_title_ref(e), stored_score=old, current_score=now_score))
        drifted.sort(key=lambda r: abs((r.stored_score if r.stored_score is not None else 0) - r.current_score), reverse=True)
        return DriftReport(
            checked=len(entities), drifted=len(drifted), rows=drifted[:DRIFT_ROWS],
            drifted_ids=[r.title.id for r in drifted],
        )

    async def recompute(self, admin: AdminAccount, entity_ids: list[uuid.UUID], request: Request | None = None) -> RecomputeResult:
        await enforce("admin-ranking-recompute", str(admin.id), RECOMPUTE_RATE_LIMIT, RECOMPUTE_RATE_WINDOW_SECONDS)
        entities = (
            await self.db.execute(select(Entity).where(Entity.id.in_(entity_ids), Entity.entity_type.in_(TITLE_TYPES)))
        ).scalars().all()
        if not entities:
            raise NotFoundError("Title not found")
        await self.ranking.recompute_entities(list(entities))
        target = str(entities[0].id) if len(entities) == 1 else "bulk"
        await AuditLogService(self.db).record(
            admin, "ranking.recompute", "entity", target,
            after={"count": len(entities), "titles": [e.title for e in entities[:5]]}, request=request,
        )
        await self.db.commit()
        for e in entities:
            invalidate_title_detail(e.entity_type, e.slug)
        return RecomputeResult(recomputed=len(entities))
