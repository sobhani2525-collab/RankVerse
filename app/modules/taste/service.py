import uuid

from sqlalchemy import case, func, literal, select, union_all
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import parallel
from app.core.cache import cached
from app.modules.battles.models import PairVote, VoteOutcome
from app.modules.entities.models import Entity, RelationshipEdge
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
    TasteExampleTitle,
    TasteFacets,
    TasteInsightPublic,
    TastePersonEntity,
    TastePersonPublic,
    TasteProfile,
    TasteSharePublic,
    TasteSnapshotPublic,
)
from app.modules.users.models import UserFavorite, UserRating

# Example titles shown under each genre row.
GENRE_EXAMPLES = 3
# How much each kind of liked title counts when picking a genre's examples:
# a rating by its stars above the user's average (+1), a ♥ like a rating
# 1.5 stars above it, each battle win a little.
FAVORITE_EXAMPLE_WEIGHT = 1.5
BATTLE_WIN_EXAMPLE_WEIGHT = 0.3

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

    async def _genre_examples(
        self, user_id: uuid.UUID, genre_keys: list[str], ratings_avg: float | None
    ) -> dict[str, list[TasteExampleTitle]]:
        """
        Up to GENRE_EXAMPLES of the user's liked titles per genre -- rated at
        or above their own average, ♥'d, or picked in battles -- strongest
        first. Lets the profile show *which* films put a genre where it is
        (a genre is a blend of many titles, not just the anchors).
        """
        if not genre_keys:
            return {}
        won = case((PairVote.winner == VoteOutcome.LEFT, PairVote.left_item), else_=PairVote.right_item)
        parts = [
            select(UserFavorite.entity_id.label("entity_id"), literal(FAVORITE_EXAMPLE_WEIGHT).label("w")).where(
                UserFavorite.user_id == user_id
            ),
            select(won.label("entity_id"), literal(BATTLE_WIN_EXAMPLE_WEIGHT).label("w")).where(
                PairVote.user_id == user_id, PairVote.winner != VoteOutcome.SKIP
            ),
        ]
        if ratings_avg is not None:
            parts.append(
                select(
                    UserRating.entity_id.label("entity_id"),
                    (UserRating.score - ratings_avg + 1).label("w"),
                ).where(UserRating.user_id == user_id, UserRating.score >= ratings_avg)
            )
        liked = union_all(*parts).subquery()
        Genre = aliased(Entity)
        Title = aliased(Entity)
        stmt = (
            select(
                Genre.slug,
                Title.slug,
                Title.title,
                Title.attributes["title_fa"].astext,
                Title.entity_type,
                func.sum(liked.c.w).label("weight"),
            )
            .select_from(liked)
            .join(Title, Title.id == liked.c.entity_id)
            .join(
                RelationshipEdge,
                (RelationshipEdge.from_entity_id == Title.id) & (RelationshipEdge.relation_type == "has_genre"),
            )
            .join(Genre, Genre.id == RelationshipEdge.to_entity_id)
            .where(Genre.slug.in_(genre_keys))
            .group_by(Genre.slug, Title.id, Title.slug, Title.title, Title.attributes["title_fa"].astext, Title.entity_type)
        )
        rows = sorted((await self.db.execute(stmt)).all(), key=lambda r: (-r.weight, r[1]))
        out: dict[str, list[TasteExampleTitle]] = {}
        for genre_slug, slug, title, title_fa, entity_type, _ in rows:
            bucket = out.setdefault(genre_slug, [])
            if len(bucket) < GENRE_EXAMPLES:
                bucket.append(TasteExampleTitle(slug=slug, title=title, title_fa=title_fa or None, entity_type=entity_type))
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
        examples = await self._genre_examples(
            user_id, [g.dimension_key for g in genres], float(ratings_avg) if ratings_avg is not None else None
        )
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
                    examples=examples.get(g.dimension_key, []),
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
