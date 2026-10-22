from sqlalchemy import Integer, and_, cast, exists, func, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cached
from app.modules.admin.seo_schemas import (
    AdminSeoOverview, SeoBattles, SeoGap, SeoLists, SeoPeopleContent, SeoSitemap, SeoTitleContent,
)
from app.modules.battles.tournament_models import Battle
from app.modules.daily_battle.tehran import utcnow
from app.modules.entities.models import Entity
from app.modules.entities.repository import EntityRepository
from app.modules.lists.models import UserList, UserListItem

# The person sitemap filter (EXISTS over relationships) takes seconds on the full
# catalog, and none of these numbers move fast.
STATS_TTL_SECONDS = 600
STATS_CACHE_KEY = "admin:seo:overview"
GAP_LIMIT = 15

PERSIAN_LETTER = "[؀-ۿ]"


def _attr(key: str):
    return Entity.attributes[key].astext


def _blank(key: str):
    return func.coalesce(func.btrim(_attr(key)), "") == ""


def _not_persian(key: str):
    """Empty, or text with no Persian/Arabic letter in it (an English fallback)."""
    return or_(_blank(key), not_(_attr(key).op("~")(PERSIAN_LETTER)))


class AdminSeoService:
    """What search engines get from the site (/admin/seo): what the sitemaps
    list, and the content gaps that make a page thin or a result snippet poor.
    The rules mirror the frontend's (lib/seo.ts, app/sitemaps, lists/[slug])."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def overview(self) -> AdminSeoOverview:
        raw = await cached(STATS_CACHE_KEY, STATS_TTL_SECONDS, self._load)
        return AdminSeoOverview.model_validate(raw)

    async def _one(self, stmt) -> dict:
        return dict((await self.db.execute(stmt)).one()._mapping)

    async def _title_content(self, entity_type: str) -> SeoTitleContent:
        row = await self._one(
            select(
                func.count().label("total"),
                func.count().filter(_blank("title_fa")).label("missing_title_fa"),
                func.count().filter(_not_persian("overview")).label("missing_overview_fa"),
                func.count().filter(_attr("overview_source") == "machine").label("machine_overview"),
                func.count().filter(_blank("poster_path")).label("missing_poster"),
            ).where(Entity.entity_type == entity_type)
        )
        return SeoTitleContent(**row)

    async def _gaps(self) -> list[SeoGap]:
        no_title = _blank("title_fa")
        no_overview = _not_persian("overview")
        no_poster = _blank("poster_path")
        votes = cast(_attr("external_vote_count"), Integer)
        rows = await self.db.execute(
            select(
                Entity.id, Entity.entity_type, Entity.title, Entity.slug, _attr("year").label("year"),
                votes.label("votes"),
                no_title.label("no_title"), no_overview.label("no_overview"), no_poster.label("no_poster"),
            )
            .where(Entity.entity_type.in_(("movie", "tv_series")), or_(no_title, no_overview, no_poster))
            .order_by(votes.desc().nulls_last(), Entity.title)
            .limit(GAP_LIMIT)
        )
        gaps = []
        for r in rows.all():
            missing = [k for k, flag in (("title_fa", r.no_title), ("overview_fa", r.no_overview), ("poster", r.no_poster)) if flag]
            year = int(r.year) if r.year and r.year.isdigit() else None
            gaps.append(SeoGap(
                id=r.id, entity_type=r.entity_type, title=r.title, slug=r.slug, year=year, vote_count=r.votes,
                missing=missing,
            ))
        return gaps

    async def _load(self) -> dict:
        repo = EntityRepository(self.db)
        sitemap_counts = await repo.sitemap_counts(("movie", "tv_series", "person", "genre"))

        has_items = exists(select(UserListItem.id).where(UserListItem.list_id == UserList.id))
        public = UserList.visibility == "public"
        lists = await self._one(
            select(
                func.count().filter(public, UserList.is_hidden_from_discovery.is_(False), has_items).label("indexable"),
                func.count().filter(public, not_(has_items)).label("empty_public"),
                func.count().filter(public, UserList.is_hidden_from_discovery.is_(True)).label("hidden"),
                func.count().filter(not_(public)).label("private"),
            ).where(UserList.is_watch_later.is_(False))
        )

        people = await self._one(
            select(
                func.count().label("total"),
                func.count().filter(_blank("biography")).label("missing_biography"),
                func.count().filter(
                    and_(not_(_blank("biography")), not_(_attr("biography").op("~")(PERSIAN_LETTER)))
                ).label("english_biography"),
            ).where(Entity.entity_type == "person")
        )

        battles = await self._one(
            select(
                func.count().filter(Battle.visibility == "public", Battle.is_hidden_from_discovery.is_(False))
                .label("public"),
                func.count().filter(Battle.visibility == "unlisted").label("unlisted"),
                func.count().filter(Battle.visibility == "public", Battle.is_hidden_from_discovery.is_(True))
                .label("hidden"),
            ).where(Battle.status != "draft")
        )

        return AdminSeoOverview(
            sitemap=SeoSitemap(**sitemap_counts, lists=lists["indexable"]),
            movies=await self._title_content("movie"),
            tv_series=await self._title_content("tv_series"),
            people=SeoPeopleContent(
                total=people["total"], without_credits=people["total"] - sitemap_counts["person"],
                missing_biography=people["missing_biography"], english_biography=people["english_biography"],
            ),
            lists=SeoLists(**lists),
            battles=SeoBattles(**battles),
            gaps=await self._gaps(),
            generated_at=utcnow(),
        ).model_dump(mode="json")
