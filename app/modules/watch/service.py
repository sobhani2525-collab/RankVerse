import uuid
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy import Integer, cast, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, RateLimitedError
from app.core.rate_limit import enforce
from app.modules.admin.audit import AuditLogService
from app.modules.admin.models import AdminAccount
from app.modules.entities.models import Entity
from app.modules.watch.models import WatchLink
from app.modules.watch.providers import ACCESS_TYPES, PROVIDER_BY_KEY, PROVIDER_ORDER, validate_link
from app.modules.watch.schemas import (
    WatchEntityHit, WatchLinkAdmin, WatchLinkImportResult, WatchLinkImportRow, WatchLinkPublic, WatchLinkUpsert,
)

WATCHABLE_TYPES = ("movie", "tv_series")
CLICKS_PER_IP_PER_LINK_PER_HOUR = 20  # beyond this a click still redirects but is not counted


def _provider_name(key: str) -> str:
    return PROVIDER_BY_KEY[key].name if key in PROVIDER_BY_KEY else key


def to_public(link: WatchLink) -> WatchLinkPublic:
    return WatchLinkPublic(
        id=link.id,
        provider=link.provider,
        provider_name=_provider_name(link.provider),
        access_type=link.access_type,
        access_label=ACCESS_TYPES.get(link.access_type, link.access_type),
        is_affiliate=link.is_affiliate,
    )


async def public_links_for(db: AsyncSession, entity_id: uuid.UUID) -> list[WatchLinkPublic]:
    rows = (await db.execute(select(WatchLink).where(WatchLink.entity_id == entity_id))).scalars().all()
    rows = sorted((r for r in rows if r.provider in PROVIDER_BY_KEY), key=lambda r: PROVIDER_ORDER[r.provider])
    return [to_public(r) for r in rows]


def _admin_row(link: WatchLink, entity: Entity) -> WatchLinkAdmin:
    return WatchLinkAdmin(
        id=link.id, entity_id=entity.id, entity_type=entity.entity_type, entity_title=entity.title, entity_title_fa=(entity.attributes or {}).get("title_fa"), entity_slug=entity.slug,
        provider=link.provider, provider_name=_provider_name(link.provider),
        url=link.url, access_type=link.access_type, is_affiliate=link.is_affiliate, source=link.source,
        click_count=link.click_count, updated_at=link.updated_at,
    )


def _like(q: str) -> str:
    return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def _title_matches(q: str):
    """Titles are stored in their original language; the Persian name lives in attributes."""
    pattern = _like(q)
    return or_(
        Entity.title.ilike(pattern, escape="\\"),
        Entity.attributes["title_fa"].astext.ilike(pattern, escape="\\"),
    )


class WatchService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # --- visitors ---

    async def track_click(self, link_id: uuid.UUID, ip: str) -> str:
        """Returns the destination URL and counts the click (at most
        CLICKS_PER_IP_PER_LINK_PER_HOUR per IP per link per hour, so a refresh
        loop or a bot can't inflate the numbers)."""
        link = await self.db.get(WatchLink, link_id)
        if link is None:
            raise NotFoundError("Link not found")
        url = link.url
        try:
            await enforce("watch-click", f"{ip}:{link_id}", CLICKS_PER_IP_PER_LINK_PER_HOUR, 3600)
        except RateLimitedError:
            return url
        await self.db.execute(
            update(WatchLink).where(WatchLink.id == link_id).values(click_count=WatchLink.click_count + 1)
        )
        await self.db.commit()
        return url

    # --- admin ---

    async def list_links(self, q: str | None, provider: str | None, page: int, page_size: int):
        conds = []
        if q:
            conds.append(_title_matches(q))
        if provider:
            conds.append(WatchLink.provider == provider)
        base = select(WatchLink, Entity).join(Entity, Entity.id == WatchLink.entity_id).where(*conds)
        total = (await self.db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = (
            await self.db.execute(
                base.order_by(WatchLink.click_count.desc(), WatchLink.updated_at.desc())
                .offset((page - 1) * page_size).limit(page_size)
            )
        ).all()
        return [_admin_row(link, ent) for link, ent in rows], total

    async def search_entities(self, q: str, limit: int = 10) -> list[WatchEntityHit]:
        votes = cast(Entity.attributes["external_vote_count"].astext, Integer)
        counts = select(WatchLink.entity_id, func.count().label("n")).group_by(WatchLink.entity_id).subquery()
        rows = (
            await self.db.execute(
                select(Entity, func.coalesce(counts.c.n, 0))
                .outerjoin(counts, counts.c.entity_id == Entity.id)
                .where(Entity.entity_type.in_(WATCHABLE_TYPES), _title_matches(q))
                .order_by(votes.desc().nulls_last(), Entity.title)
                .limit(limit)
            )
        ).all()
        hits = []
        for e, n in rows:
            year = (e.attributes or {}).get("year")
            hits.append(WatchEntityHit(
                id=e.id, entity_type=e.entity_type, title=e.title, title_fa=(e.attributes or {}).get("title_fa"), slug=e.slug,
                year=year if isinstance(year, int) else None, link_count=n,
            ))
        return hits

    async def _entity(self, entity_id: uuid.UUID) -> Entity:
        entity = await self.db.get(Entity, entity_id)
        if entity is None or entity.entity_type not in WATCHABLE_TYPES:
            raise NotFoundError("Entity not found")
        return entity

    async def _upsert(self, admin: AdminAccount, entity: Entity, data: WatchLinkUpsert | WatchLinkImportRow,
                      source: str, request: Request | None) -> WatchLink:
        url = validate_link(data.provider, data.url, data.access_type)
        link = (
            await self.db.execute(
                select(WatchLink).where(WatchLink.entity_id == entity.id, WatchLink.provider == data.provider)
            )
        ).scalar_one_or_none()
        before = None
        if link is None:
            link = WatchLink(entity_id=entity.id, provider=data.provider)
            self.db.add(link)
        else:
            before = {"url": link.url, "access_type": link.access_type, "is_affiliate": link.is_affiliate}
        link.url = url
        link.access_type = data.access_type
        link.is_affiliate = data.is_affiliate
        link.source = source
        link.verified_at = datetime.now(timezone.utc)
        await self.db.flush()
        await AuditLogService(self.db).record(
            admin, "watch_link.set" if before is None else "watch_link.update", "entity", entity.id,
            before=before,
            after={"provider": data.provider, "url": url, "access_type": data.access_type, "is_affiliate": data.is_affiliate},
            request=request,
        )
        return link

    async def upsert(self, admin: AdminAccount, payload: WatchLinkUpsert, request: Request | None = None) -> WatchLinkAdmin:
        entity = await self._entity(payload.entity_id)
        link = await self._upsert(admin, entity, payload, "manual", request)
        await self.db.commit()
        # commit expires both rows; reload them here, since reading an expired
        # attribute lazily is not allowed on an async session.
        await self.db.refresh(link)
        await self.db.refresh(entity)
        return _admin_row(link, entity)

    async def delete(self, admin: AdminAccount, link_id: uuid.UUID, request: Request | None = None) -> None:
        link = await self.db.get(WatchLink, link_id)
        if link is None:
            raise NotFoundError("Link not found")
        await AuditLogService(self.db).record(
            admin, "watch_link.delete", "entity", link.entity_id,
            before={"provider": link.provider, "url": link.url}, request=request,
        )
        await self.db.delete(link)
        await self.db.commit()

    async def import_rows(self, admin: AdminAccount, rows: list[WatchLinkImportRow],
                          request: Request | None = None) -> list[WatchLinkImportResult]:
        """Applies every valid row and reports the rest; one bad row never blocks the others."""
        slugs = {r.entity_slug for r in rows}
        found = (
            await self.db.execute(
                select(Entity).where(Entity.slug.in_(slugs), Entity.entity_type.in_(WATCHABLE_TYPES))
            )
        ).scalars().all()
        by_slug: dict[str, list[Entity]] = {}
        for e in found:
            by_slug.setdefault(e.slug, []).append(e)

        results: list[WatchLinkImportResult] = []
        for i, row in enumerate(rows, start=1):
            matches = by_slug.get(row.entity_slug, [])
            error = None
            if not matches:
                error = "عنوانی با این slug پیدا نشد"
            elif len(matches) > 1:
                error = "این slug برای چند عنوان وجود دارد؛ از فرم تکی استفاده کنید"
            else:
                try:
                    async with self.db.begin_nested():
                        await self._upsert(admin, matches[0], row, "import", request)
                except Exception as exc:  # a bad URL or a constraint problem: report it, keep going
                    error = getattr(exc, "message", None) or str(exc)
            results.append(WatchLinkImportResult(row=i, entity_slug=row.entity_slug, ok=error is None, error=error))
        await self.db.commit()
        return results
