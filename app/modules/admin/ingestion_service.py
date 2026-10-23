import os
import time
from datetime import timedelta

import httpx
from fastapi import Request
from sqlalchemy import Integer, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import NotFoundError, RankVerseError
from app.core.rate_limit import enforce
from app.modules.admin.audit import AuditLogService
from app.modules.admin.ingestion_schemas import (
    AdminIngestionOverview, IngestionAlerts, IngestionRun, IngestionSources, IngestionSyncRequest,
    IngestionSyncResult, IngestionTitle, IngestionTitleCoverage, IngestionTypeStats, TmdbCheck,
)
from app.modules.admin.models import AdminAccount, AdminAuditLog
from app.modules.alerts.models import AdminAlert
from app.modules.daily_battle.tehran import utcnow
from app.modules.entities.detail_cache import invalidate_title_detail
from app.modules.entities.models import Entity
from app.modules.entities.repository import EntityRepository
from app.modules.sync.service import SyncService

CATALOG_TYPES = ("movie", "tv_series", "person", "genre")
TITLE_TYPES = ("movie", "tv_series")
STALE_DAYS = 180
STALE_MIN_VOTES = 1000  # only titles people actually look for
LIST_LIMIT = 10
RUNS_LIMIT = 15
# One title is ~2-4 TMDb requests plus a ranking recompute: generous for hand use,
# tight enough to stop a runaway script hammering TMDb through the panel.
SYNC_RATE_LIMIT = 30
SYNC_RATE_WINDOW_SECONDS = 10 * 60


def _attr(key: str):
    return Entity.attributes[key].astext


def _title_row(e: Entity) -> IngestionTitle:
    attrs = e.attributes or {}
    votes = attrs.get("external_vote_count")
    return IngestionTitle(
        id=e.id, entity_type=e.entity_type, title=e.title, title_fa=attrs.get("title_fa") or None, slug=e.slug,
        tmdb_id=e.external_id if e.external_source == "tmdb" else None,
        vote_count=votes if isinstance(votes, int) else None,
        created_at=e.created_at, updated_at=e.updated_at,
    )


class AdminIngestionService:
    """Where the catalog comes from and how fresh it is (/admin/ingestion),
    plus syncing one TMDb title by hand. Bulk imports stay CLI scripts
    (scripts/import_tmdb_catalog.py and friends): they run for hours."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # --- overview -------------------------------------------------------

    async def _grouped(self, column, *where) -> dict[str, dict[str, int]]:
        rows = await self.db.execute(
            select(Entity.entity_type, column, func.count()).where(*where).group_by(Entity.entity_type, column)
        )
        out: dict[str, dict[str, int]] = {}
        for entity_type, key, n in rows.all():
            out.setdefault(entity_type, {})[key or "none"] = n
        return out

    async def overview(self) -> AdminIngestionOverview:
        now = utcnow()
        d7, d30, stale = (now - timedelta(days=n) for n in (7, 30, STALE_DAYS))

        rows = await self.db.execute(
            select(
                Entity.entity_type,
                func.count().label("total"),
                func.count().filter(Entity.created_at >= d7).label("added_7d"),
                func.count().filter(Entity.created_at >= d30).label("added_30d"),
                func.count().filter(Entity.updated_at >= d7).label("changed_7d"),
                func.count().filter(Entity.updated_at < stale).label("unchanged_180d"),
                func.max(Entity.created_at).label("last_added_at"),
                func.max(Entity.updated_at).label("last_changed_at"),
            )
            .where(Entity.entity_type.in_(CATALOG_TYPES))
            .group_by(Entity.entity_type)
        )
        by_type = {r.entity_type: dict(r._mapping) for r in rows.all()}
        sources = await self._grouped(Entity.external_source, Entity.entity_type.in_(CATALOG_TYPES))
        types = []
        for t in CATALOG_TYPES:
            r = by_type.get(t) or {"total": 0, "added_7d": 0, "added_30d": 0, "changed_7d": 0, "unchanged_180d": 0}
            types.append(IngestionTypeStats(
                entity_type=t, total=r["total"], added_7d=r["added_7d"], added_30d=r["added_30d"],
                changed_7d=r["changed_7d"], unchanged_180d=r["unchanged_180d"],
                last_added_at=r.get("last_added_at"), last_changed_at=r.get("last_changed_at"),
                sources=sources.get(t, {}),
            ))

        imdb = await self.db.execute(
            select(
                Entity.entity_type,
                func.count().label("total"),
                func.count().filter(func.coalesce(_attr("imdb_id"), "") != "").label("with_imdb_id"),
                func.count().filter(_attr("imdb_rating").is_not(None)).label("with_imdb_rating"),
            )
            .where(Entity.entity_type.in_(TITLE_TYPES))
            .group_by(Entity.entity_type)
        )
        imdb_by_type = {r.entity_type: dict(r._mapping) for r in imdb.all()}
        overview_sources = await self._grouped(_attr("overview_source"), Entity.entity_type.in_(TITLE_TYPES))
        coverage = [
            IngestionTitleCoverage(
                entity_type=t,
                total=imdb_by_type.get(t, {}).get("total", 0),
                with_imdb_id=imdb_by_type.get(t, {}).get("with_imdb_id", 0),
                with_imdb_rating=imdb_by_type.get(t, {}).get("with_imdb_rating", 0),
                overview_sources=overview_sources.get(t, {}),
            )
            for t in TITLE_TYPES
        ]
        biography_sources = (await self._grouped(_attr("biography_source"), Entity.entity_type == "person")).get("person", {})

        recent = (
            await self.db.execute(
                select(Entity).where(Entity.entity_type.in_(TITLE_TYPES))
                .order_by(Entity.created_at.desc()).limit(LIST_LIMIT)
            )
        ).scalars().all()
        votes = cast(_attr("external_vote_count"), Integer)
        stale_rows = (
            await self.db.execute(
                select(Entity)
                .where(Entity.entity_type.in_(TITLE_TYPES), Entity.external_source == "tmdb", votes >= STALE_MIN_VOTES)
                .order_by(Entity.updated_at, votes.desc())
                .limit(LIST_LIMIT)
            )
        ).scalars().all()

        runs = (
            await self.db.execute(
                select(AdminAuditLog).where(AdminAuditLog.action.like("ingestion.%"))
                .order_by(AdminAuditLog.created_at.desc()).limit(RUNS_LIMIT)
            )
        ).scalars().all()

        alert_open = (AdminAlert.source == "sync") & AdminAlert.resolved_at.is_(None)
        alerts = (
            await self.db.execute(
                select(AdminAlert.title, AdminAlert.last_seen_at).where(alert_open)
                .order_by(AdminAlert.last_seen_at.desc())
            )
        ).all()

        return AdminIngestionOverview(
            sources=IngestionSources(
                tmdb_configured=bool(settings.tmdb_api_key),
                tmdb_base_url=settings.tmdb_base_url,
                translation_configured=bool(settings.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY")),
                translation_model=settings.overview_translation_model,
            ),
            types=types,
            coverage=coverage,
            biography_sources=biography_sources,
            recent=[_title_row(e) for e in recent],
            stale=[_title_row(e) for e in stale_rows],
            runs=[
                IngestionRun(created_at=r.created_at, admin_email=r.admin_email, action=r.action,
                             target_id=str(r.target_id), after=r.after)
                for r in runs
            ],
            sync_alerts=IngestionAlerts(
                open=len(alerts),
                last_title=alerts[0].title if alerts else None,
                last_seen_at=alerts[0].last_seen_at if alerts else None,
            ),
            generated_at=now,
        )

    # --- TMDb -----------------------------------------------------------

    async def tmdb_check(self) -> TmdbCheck:
        """One cheap authenticated request: is TMDb reachable from this server, and is the key valid?"""
        if not settings.tmdb_api_key:
            return TmdbCheck(ok=False, ms=0, message="کلید TMDb (TMDB_API_KEY) تنظیم نشده است.")
        started = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(10, connect=8)) as client:
                res = await client.get(f"{settings.tmdb_base_url}/configuration", params={"api_key": settings.tmdb_api_key})
        except httpx.TransportError as e:
            ms = int((time.monotonic() - started) * 1000)
            return TmdbCheck(ok=False, ms=ms, message=f"TMDb از این سرور در دسترس نیست ({type(e).__name__}).")
        ms = int((time.monotonic() - started) * 1000)
        if res.status_code == 200:
            return TmdbCheck(ok=True, status=200, ms=ms, message="اتصال به TMDb برقرار است.")
        if res.status_code == 401:
            return TmdbCheck(ok=False, status=401, ms=ms, message="TMDb کلید را نپذیرفت؛ TMDB_API_KEY نامعتبر است.")
        return TmdbCheck(ok=False, status=res.status_code, ms=ms, message=f"TMDb با کد {res.status_code} پاسخ داد.")

    async def sync(self, admin: AdminAccount, payload: IngestionSyncRequest, request: Request | None = None) -> IngestionSyncResult:
        if not settings.tmdb_api_key:
            raise RankVerseError("کلید TMDb (TMDB_API_KEY) روی سرور تنظیم نشده است.", status_code=503, code="tmdb_not_configured")
        await enforce("admin-ingestion-sync", str(admin.id), SYNC_RATE_LIMIT, SYNC_RATE_WINDOW_SECONDS)
        tmdb_id = str(payload.tmdb_id)
        existed = await EntityRepository(self.db).get_by_external_id("tmdb", tmdb_id, payload.entity_type) is not None
        service = SyncService(self.db)
        try:
            if payload.entity_type == "movie":
                result = await service.sync_movie(payload.tmdb_id)
            else:
                result = await service.sync_tv_series(payload.tmdb_id)
        except httpx.HTTPStatusError as e:
            await self.db.rollback()
            if e.response.status_code == 404:
                kind = "فیلمی" if payload.entity_type == "movie" else "سریالی"
                raise NotFoundError(f"TMDb {kind} با شناسهٔ {tmdb_id} ندارد.")
            if e.response.status_code == 401:
                raise RankVerseError("TMDb کلید را نپذیرفت؛ TMDB_API_KEY نامعتبر است.", status_code=502, code="upstream_error")
            raise RankVerseError(f"TMDb با کد {e.response.status_code} پاسخ داد.", status_code=502, code="upstream_error")
        except httpx.TransportError:
            await self.db.rollback()
            raise RankVerseError("TMDb از این سرور در دسترس نیست.", status_code=502, code="upstream_unreachable")

        # sync_* has committed the title; the audit row is its own small transaction.
        await AuditLogService(self.db).record(
            admin, "ingestion.sync", "entity", result["id"],
            after={"entity_type": payload.entity_type, "tmdb_id": payload.tmdb_id, "title": result["title"],
                   "created": not existed},
            request=request,
        )
        await self.db.commit()
        invalidate_title_detail(payload.entity_type, result["slug"])
        return IngestionSyncResult(
            id=result["id"], entity_type=payload.entity_type, title=result["title"], slug=result["slug"],
            created=not existed,
        )
