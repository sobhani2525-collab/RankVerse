"""
Candidate picker for the battle builder: entities of one type narrowed by any
combination of person (director / actor / creator), genre and decade -- every
filter given must hold ("1990s comedies directed by X"). Read-only; picking
the entries themselves still goes through PUT /battles/{slug}/entries.
"""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.entities.models import Entity, EntityRanking, RelationshipEdge
from app.modules.entities.repository import PEOPLE_ROLE_TYPES

from app.modules.search.router import _escape_like

from .tournament_views import entity_brief


def _linked_to(relation_types: list[str], target_slug: str, target_type: str):
    """Entities with an edge of one of these types to the target (looked up by slug)."""
    return (
        select(RelationshipEdge.from_entity_id)
        .join(Entity, Entity.id == RelationshipEdge.to_entity_id)
        .where(
            RelationshipEdge.relation_type.in_(relation_types),
            Entity.slug == target_slug,
            Entity.entity_type == target_type,
        )
    )


async def find_candidates(
    db: AsyncSession,
    *,
    entity_type: str,
    person_slug: str | None,
    person_role: str,
    genre_slug: str | None,
    decade: int | None,
    q: str | None,
    limit: int,
    offset: int,
) -> tuple[list[dict], int]:
    conditions = [Entity.entity_type == entity_type]
    if person_slug:
        roles = PEOPLE_ROLE_TYPES.get(person_role, PEOPLE_ROLE_TYPES["all"])
        conditions.append(Entity.id.in_(_linked_to(roles, person_slug, "person")))
    if genre_slug:
        conditions.append(Entity.id.in_(_linked_to(["has_genre"], genre_slug, "genre")))
    if decade is not None:
        conditions.append(Entity.attributes["year"].as_integer().between(decade, decade + 9))
    if q and q.strip():
        like = f"%{_escape_like(q.strip())}%"
        conditions.append(
            Entity.title.ilike(like, escape="\\") | Entity.attributes["title_fa"].astext.ilike(like, escape="\\")
        )

    total = (await db.execute(select(func.count()).select_from(Entity).where(*conditions))).scalar_one()
    rows = (
        await db.execute(
            select(Entity, EntityRanking.computed_score)
            .outerjoin(EntityRanking, EntityRanking.entity_id == Entity.id)
            .where(*conditions)
            .order_by(EntityRanking.computed_score.desc().nulls_last(), Entity.title)
            .offset(offset)
            .limit(limit)
        )
    ).all()
    items = [
        {**entity_brief(entity), "year": (entity.attributes or {}).get("year"), "score": score}
        for entity, score in rows
    ]
    return items, total


async def list_genres(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(select(Entity).where(Entity.entity_type == "genre").order_by(Entity.title))).scalars()
    return [
        {"slug": g.slug, "title": g.title, "title_fa": (g.attributes or {}).get("title_fa")} for g in rows
    ]
