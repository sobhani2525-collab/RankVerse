import re
import uuid

from fastapi import Request
from sqlalchemy import Integer, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.modules.admin.audit import AuditLogService
from app.modules.admin.entities_schemas import AdminEntityOverviewRow
from app.modules.admin.models import AdminAccount
from app.modules.entities.detail_cache import invalidate_title_detail
from app.modules.entities.models import Entity
from app.modules.sync.translation import is_persian

OVERVIEW_ENTITY_TYPES = ("movie", "tv_series")
OVERVIEW_SOURCES = ("tmdb_fa", "machine", "manual", "en")

_APARAT_HASH = r"[A-Za-z0-9]{3,32}"
_APARAT_URL = re.compile(
    rf"aparat\.com/(?:v/|video/video/embed/videohash/|embed/)({_APARAT_HASH})(?![A-Za-z0-9])", re.IGNORECASE
)


def parse_aparat_hash(value: str) -> str | None:
    """The video hash from an Aparat watch link (aparat.com/v/<hash>/...),
    embed URL (.../embed/videohash/<hash>/vt/frame, /embed/<hash>?...), a
    pasted iframe/script snippet containing one, or a bare hash."""
    value = value.strip()
    if re.fullmatch(_APARAT_HASH, value):
        return value
    match = _APARAT_URL.search(value)
    return match.group(1) if match else None


def _row(entity: Entity) -> AdminEntityOverviewRow:
    attrs = entity.attributes or {}
    year = attrs.get("year")
    votes = attrs.get("external_vote_count")
    return AdminEntityOverviewRow(
        id=entity.id,
        entity_type=entity.entity_type,
        title=entity.title,
        title_fa=attrs.get("title_fa"),
        slug=entity.slug,
        year=year if isinstance(year, int) else None,
        vote_count=votes if isinstance(votes, int) else None,
        overview=attrs.get("overview"),
        overview_en=attrs.get("overview_en"),
        overview_source=attrs.get("overview_source"),
        trailer_key=attrs.get("trailer_key"),
        aparat_trailer=attrs.get("aparat_trailer"),
    )


class AdminEntityService:
    """Hand-written Persian overviews for movies and series, for the titles
    TMDb has none for. A manual overview is marked overview_source="manual":
    sync (SyncService._merge_preserved_attributes) and the machine
    translation (sync/translation.english_source) both leave it alone.

    Also Aparat trailers (attributes.aparat_trailer), for titles whose only
    trailer is on YouTube -- or none at all, as with most Iranian ones.
    A re-sync keeps them too."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get(self, entity_id: uuid.UUID) -> Entity:
        entity = await self.db.get(Entity, entity_id)
        if entity is None or entity.entity_type not in OVERVIEW_ENTITY_TYPES:
            raise NotFoundError("Entity not found")
        return entity

    async def search(
        self, q: str | None, source: str | None, page: int, page_size: int, trailer: str | None = None
    ) -> tuple[list[AdminEntityOverviewRow], int]:
        conditions = [Entity.entity_type.in_(OVERVIEW_ENTITY_TYPES)]
        if q:
            pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            conditions.append(or_(
                Entity.title.ilike(pattern, escape="\\"),
                Entity.attributes["title_fa"].astext.ilike(pattern, escape="\\"),
            ))
        if source:
            conditions.append(Entity.attributes["overview_source"].astext == source)
        if trailer == "aparat":
            conditions.append(Entity.attributes.has_key("aparat_trailer"))
        elif trailer == "none":
            conditions.append(~Entity.attributes.has_key("aparat_trailer"))
            conditions.append(~Entity.attributes.has_key("trailer_key"))
        total = (await self.db.execute(select(func.count()).select_from(Entity).where(*conditions))).scalar_one()
        votes = cast(Entity.attributes["external_vote_count"].astext, Integer)
        rows = (
            await self.db.execute(
                select(Entity)
                .where(*conditions)
                .order_by(votes.desc().nulls_last(), Entity.title)
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).scalars().all()
        return [_row(e) for e in rows], total

    async def set_manual_overview(
        self, admin: AdminAccount, entity_id: uuid.UUID, overview: str, request: Request | None = None
    ) -> AdminEntityOverviewRow:
        overview = overview.strip()
        if not is_persian(overview):
            raise ValidationError("Overview must be written in Persian")
        entity = await self._get(entity_id)
        attrs = dict(entity.attributes or {})
        before = {"overview": attrs.get("overview"), "overview_source": attrs.get("overview_source")}
        # Titles synced before overview_en existed only have `overview`: keep
        # the English one as the source text so "reset" has something to go back to.
        if not attrs.get("overview_en") and attrs.get("overview") and not is_persian(attrs["overview"]):
            attrs["overview_en"] = attrs["overview"]
        attrs.update(overview=overview, overview_source="manual")
        attrs.pop("overview_translation_v", None)
        entity.attributes = attrs
        await AuditLogService(self.db).record(
            admin, "entity.overview.set", "entity", entity.id,
            before=before, after={"overview": overview, "overview_source": "manual"}, request=request,
        )
        await self.db.commit()
        invalidate_title_detail(entity.entity_type, entity.slug)
        return _row(entity)

    async def reset_overview(
        self, admin: AdminAccount, entity_id: uuid.UUID, request: Request | None = None
    ) -> AdminEntityOverviewRow:
        """Drops a manual overview: back to the English one, untranslated, so
        the next translation run (or a TMDb Persian overview, on the next
        sync) fills it in again."""
        entity = await self._get(entity_id)
        attrs = dict(entity.attributes or {})
        if attrs.get("overview_source") != "manual":
            raise ValidationError("This overview was not written manually")
        before = {"overview": attrs.get("overview"), "overview_source": "manual"}
        english = attrs.get("overview_en") or None
        attrs.update(overview=english, overview_source="en" if english else None)
        attrs.pop("overview_translation_v", None)
        entity.attributes = attrs
        await AuditLogService(self.db).record(
            admin, "entity.overview.reset", "entity", entity.id,
            before=before, after={"overview": english, "overview_source": attrs["overview_source"]}, request=request,
        )
        await self.db.commit()
        invalidate_title_detail(entity.entity_type, entity.slug)
        return _row(entity)

    async def set_aparat_trailer(
        self, admin: AdminAccount, entity_id: uuid.UUID, url: str, request: Request | None = None
    ) -> AdminEntityOverviewRow:
        video_hash = parse_aparat_hash(url)
        if video_hash is None:
            raise ValidationError("Not an Aparat video link")
        entity = await self._get(entity_id)
        attrs = dict(entity.attributes or {})
        before = {"aparat_trailer": attrs.get("aparat_trailer")}
        attrs["aparat_trailer"] = video_hash
        entity.attributes = attrs
        await AuditLogService(self.db).record(
            admin, "entity.trailer.set", "entity", entity.id,
            before=before, after={"aparat_trailer": video_hash}, request=request,
        )
        await self.db.commit()
        invalidate_title_detail(entity.entity_type, entity.slug)
        return _row(entity)

    async def remove_aparat_trailer(
        self, admin: AdminAccount, entity_id: uuid.UUID, request: Request | None = None
    ) -> AdminEntityOverviewRow:
        entity = await self._get(entity_id)
        attrs = dict(entity.attributes or {})
        if "aparat_trailer" not in attrs:
            raise ValidationError("This title has no Aparat trailer")
        before = {"aparat_trailer": attrs.pop("aparat_trailer")}
        entity.attributes = attrs
        await AuditLogService(self.db).record(
            admin, "entity.trailer.remove", "entity", entity.id,
            before=before, after={"aparat_trailer": None}, request=request,
        )
        await self.db.commit()
        invalidate_title_detail(entity.entity_type, entity.slug)
        return _row(entity)
