"""The ranking highlights used to rank a title inside each of its groups with a
window function over the whole group. They now bisect a cached, sorted score
list per group; the result has to stay identical to RANK() OVER (ORDER BY score
DESC NULLS LAST), including ties and unscored members."""
import random

from sqlalchemy import func, select, tuple_
from sqlalchemy.orm import aliased

from app.modules.entities.models import Entity, EntityRanking, RelationshipEdge
from app.modules.entities.repository import EntityRepository
from app.modules.ranking.service import GroupScores, RankingService


def test_rank_of_matches_sql_rank_semantics():
    group = GroupScores.from_scores([9.0, 8.0, 8.0, 7.5, None, None])
    assert group.size == 6
    assert [group.rank_of(s) for s in (9.0, 8.0, 7.5)] == [1, 2, 4]
    assert group.rank_of(None) == 5  # unscored members tie behind every scored one
    assert group.rank_of(10.0) == 1 and group.rank_of(1.0) == 5


async def _reference_ranks(db, entity):
    """The previous implementation's window query, as the oracle."""
    member = aliased(Entity)
    own = aliased(RelationshipEdge)
    own_groups = select(own.relation_type, own.to_entity_id).where(
        own.from_entity_id == entity.id, own.relation_type.in_(["has_genre", "directed_by", "creator"])
    )
    ranked = (
        select(
            RelationshipEdge.relation_type.label("relation_type"),
            RelationshipEdge.from_entity_id.label("member_id"),
            RelationshipEdge.to_entity_id.label("group_id"),
            func.rank().over(
                partition_by=(RelationshipEdge.relation_type, RelationshipEdge.to_entity_id),
                order_by=EntityRanking.computed_score.desc().nulls_last(),
            ).label("rank"),
            func.count().over(
                partition_by=(RelationshipEdge.relation_type, RelationshipEdge.to_entity_id)
            ).label("group_size"),
        )
        .join(member, member.id == RelationshipEdge.from_entity_id)
        .outerjoin(EntityRanking, EntityRanking.entity_id == RelationshipEdge.from_entity_id)
        .where(
            tuple_(RelationshipEdge.relation_type, RelationshipEdge.to_entity_id).in_(own_groups),
            member.entity_type == entity.entity_type,
        )
        .subquery()
    )
    rows = (
        await db.execute(
            select(ranked.c.group_id, ranked.c.rank, ranked.c.group_size).where(ranked.c.member_id == entity.id)
        )
    ).all()
    return {group_id: (rank, size) for group_id, rank, size in rows}


async def test_highlights_equal_the_window_query_with_ties_and_nulls(db_session):
    rng = random.Random(7)
    repo = EntityRepository(db_session)
    genres = [
        await repo.create_entity(entity_type="genre", external_id=None, external_source=None, title=f"G{i}", slug=f"hg{i}", attributes={})
        for i in range(2)
    ]
    director = await repo.create_entity(entity_type="person", external_id=None, external_source=None, title="D", slug="hd", attributes={})
    movies = []
    for i in range(24):
        m = await repo.create_entity(entity_type="movie", external_id=None, external_source=None, title=f"M{i}", slug=f"hm{i}", attributes={})
        # few distinct values -> lots of ties; some members have no ranking row or a NULL score
        kind = rng.random()
        if kind < 0.7:
            db_session.add(EntityRanking(entity_id=m.id, computed_score=float(rng.choice([5.0, 6.0, 7.0, 8.0]))))
        elif kind < 0.85:
            db_session.add(EntityRanking(entity_id=m.id, computed_score=None))
        await db_session.flush()
        await repo.create_relationship(m.id, genres[i % 2].id, "has_genre")
        if i % 3 == 0:
            await repo.create_relationship(m.id, genres[(i + 1) % 2].id, "has_genre")
        if i < 12:
            await repo.create_relationship(m.id, director.id, "directed_by")
        movies.append(m)
    await db_session.commit()

    service = RankingService(db_session)
    for movie in movies:
        entity = await EntityRepository(db_session).get_by_slug(movie.slug, entity_type="movie")
        expected = await _reference_ranks(db_session, entity)
        got = await service.get_entity_highlights(entity, min_group_size=1)
        assert {h.group.id: (h.rank, h.group_size) for h in got} == expected, movie.slug
