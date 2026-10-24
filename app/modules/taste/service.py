import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import parallel
from app.core.cache import cached
from app.modules.entities.models import Entity
from app.modules.taste.compute import (
    FACET_ACTOR,
    FACET_COUNTRY,
    FACET_DECADE,
    FACET_DIRECTOR,
    PERSPECTIVE_SELF,
    build_insight,
    confidence_hint,
    genre_stats_from_rows,
    label_genres,
    taste_signal_count,
)
from app.modules.taste.repository import TasteRepository
from app.modules.taste.schemas import (
    ConfidenceHintPublic,
    ContributionStatsPublic,
    RatingStylePublic,
    TasteAnchorEntity,
    TasteAnchorPublic,
    TasteDimensionPublic,
    TasteFacets,
    TasteInsightPublic,
    TastePersonEntity,
    TastePersonPublic,
    TasteProfile,
    TasteSharePublic,
    TasteSnapshotPublic,
)
from app.modules.users.models import UserRating

# Fewer ratings than this and "how strict a rater" is just noise.
RATING_STYLE_MIN_RATINGS = 3
PLATFORM_AVG_TTL = 3600


async def _platform_avg_rating(db: AsyncSession) -> float | None:
    async def load():
        avg = (await db.execute(select(func.avg(UserRating.score)))).scalar_one_or_none()
        return float(avg) if avg is not None else None

    return await cached(("taste-platform-avg-rating",), PLATFORM_AVG_TTL, load)


class TasteService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = TasteRepository(db)

    async def _people(self, *row_groups) -> list[list[TastePersonPublic]]:
        """Resolves director/actor rows (keyed by person entity id) to their
        entities in one query; returns one list per group, score DESC."""
        parsed_groups = []
        for rows in row_groups:
            parsed = []
            for row in rows:
                try:
                    parsed.append((uuid.UUID(row.dimension_key), row))
                except ValueError:
                    continue
            parsed_groups.append(sorted(parsed, key=lambda p: -p[1].score))
        ids = {person_id for parsed in parsed_groups for person_id, _ in parsed}
        if not ids:
            return [[] for _ in row_groups]
        entities = {
            e.id: e for e in (await self.db.execute(select(Entity).where(Entity.id.in_(ids)))).scalars().all()
        }
        out = []
        for parsed in parsed_groups:
            people = []
            for person_id, row in parsed:
                entity = entities.get(person_id)
                if entity is None:
                    continue
                attrs = entity.attributes or {}
                people.append(
                    TastePersonPublic(
                        entity=TastePersonEntity(
                            id=entity.id,
                            slug=entity.slug,
                            title=entity.title,
                            title_fa=attrs.get("title_fa"),
                            profile_path=attrs.get("profile_path"),
                        ),
                        score=row.score,
                        sample_size=row.sample_size,
                    )
                )
            out.append(people)
        return out

    @staticmethod
    def _shares(rows) -> list[TasteSharePublic]:
        return [
            TasteSharePublic(key=r.dimension_key, share=r.score, sample_size=r.sample_size)
            for r in sorted(rows, key=lambda r: (-r.score, r.dimension_key))
        ]

    async def get_taste_profile(
        self, user_id: uuid.UUID, entity_scope: str = "movie", perspective: str = PERSPECTIVE_SELF
    ) -> TasteProfile:
        """
        Reads the derived Taste DNA layer as-is. A missing snapshot or empty
        lists just mean the background job hasn't computed this user's
        profile yet, not an error. `perspective` is PERSPECTIVE_OTHER on a
        public profile: the insight is then rebuilt in the third person.
        """
        async def own_reads():
            return (
                await self.repo.get_snapshot(user_id, entity_scope),
                await self.repo.list_dimensions(user_id),
                await self.repo.list_anchors_with_entities(user_id),
            )

        async def side_reads():
            async with parallel.side_session() as side:
                side_repo = TasteRepository(side)
                rating_stats = (
                    await side.execute(
                        select(func.count(UserRating.id), func.avg(UserRating.score)).where(
                            UserRating.user_id == user_id
                        )
                    )
                ).one()
                return (
                    await side_repo.get_insight(user_id),
                    await side_repo.get_contribution_stats(user_id),
                    rating_stats,
                )

        (snapshot, dimension_rows, anchor_rows), (insight, contribution_stats, rating_stats) = await parallel.gather(
            own_reads(), side_reads()
        )

        genres = genre_stats_from_rows(dimension_rows)
        anchor_ratings = {}
        if anchor_rows:
            anchor_ratings = dict(
                (
                    await self.db.execute(
                        select(UserRating.entity_id, UserRating.score).where(
                            UserRating.user_id == user_id,
                            UserRating.entity_id.in_([entity.id for _, entity in anchor_rows]),
                        )
                    )
                ).all()
            )
        by_type: dict[str, list] = {}
        for row in dimension_rows:
            by_type.setdefault(row.dimension_type, []).append(row)

        directors, actors = await self._people(by_type.get(FACET_DIRECTOR, []), by_type.get(FACET_ACTOR, []))
        facets = TasteFacets(
            directors=directors,
            actors=actors,
            decades=self._shares(by_type.get(FACET_DECADE, [])),
            countries=self._shares(by_type.get(FACET_COUNTRY, [])),
        )

        ratings_count, ratings_avg = rating_stats
        rating_style = None
        if ratings_count >= RATING_STYLE_MIN_RATINGS and ratings_avg is not None:
            rating_style = RatingStylePublic(
                ratings_count=ratings_count,
                user_avg=round(float(ratings_avg), 2),
                platform_avg=await _platform_avg_rating(self.db),
            )

        hint = None
        if snapshot is not None and contribution_stats is not None and genres:
            top = label_genres(genres)
            signals = taste_signal_count(
                contribution_stats.votes_count, contribution_stats.favorites_count, contribution_stats.battles_count
            )
            raw = confidence_hint(snapshot.model_confidence, sum(s.confidence for s in top) / len(top), signals)
            hint = ConfidenceHintPublic(**raw) if raw else None

        insight_public = TasteInsightPublic.model_validate(insight) if insight else None
        if insight_public is not None and perspective != PERSPECTIVE_SELF and genres:
            text, tags = build_insight(genres, perspective)
            insight_public = insight_public.model_copy(update={"insight_text": text, "insight_tags": tags})

        return TasteProfile(
            snapshot=TasteSnapshotPublic.model_validate(snapshot) if snapshot else None,
            dimensions=[
                TasteDimensionPublic(
                    dimension_type="genre",
                    dimension_key=g.dimension_key,
                    score=g.score,
                    confidence=g.confidence,
                    sample_size=g.sample_size,
                    updated_at=g.updated_at,
                    affinity=g.affinity,
                    lift=g.lift,
                )
                for g in genres
            ],
            anchors=[
                TasteAnchorPublic(
                    entity=TasteAnchorEntity(
                        id=entity.id,
                        slug=entity.slug,
                        title=entity.title,
                        entity_type=entity.entity_type,
                        poster_path=entity.attributes.get("poster_path"),
                        title_fa=entity.attributes.get("title_fa"),
                    ),
                    anchor_strength=anchor.anchor_strength,
                    match_score=anchor.match_score,
                    rank=anchor.rank,
                    user_rating=anchor_ratings.get(entity.id),
                )
                for anchor, entity in anchor_rows
            ],
            insight=insight_public,
            contribution_stats=(
                ContributionStatsPublic.model_validate(contribution_stats) if contribution_stats else None
            ),
            facets=facets,
            rating_style=rating_style,
            confidence_hint=hint,
        )
