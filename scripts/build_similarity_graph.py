"""
Computes weighted 'similar_to' edges by finding entities that share edges
to the same target (e.g. two movies with the same director).
Pure SQL self-join on the existing 'relationships' table.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import asyncio
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

# clear previous auto-generated similarity edges before recomputing,
# so stale weak edges (e.g. from an earlier, noisier formula) don't linger
CLEAR_OLD_SQL = """
delete from relationships where relation_type = 'similar_to' and source = 'auto';
"""

COMPUTE_SIMILARITY_SQL = """
insert into relationships (id, from_entity_id, to_entity_id, relation_type, weight, source, edge_metadata)
select
    gen_random_uuid(),
    r1.from_entity_id,
    r2.from_entity_id,
    'similar_to',
    least(1.0, sum(
        case r1.relation_type
            when 'directed_by' then 0.55
            when 'has_genre'   then 0.08
            when 'acted_in'    then 0.15
            else 0.05
        end
    )),
    'auto',
    '{}'::jsonb
from relationships r1
join relationships r2
    on r1.to_entity_id = r2.to_entity_id
    and r1.relation_type = r2.relation_type
    and r1.from_entity_id != r2.from_entity_id
where r1.relation_type in ('directed_by', 'has_genre', 'acted_in')
group by r1.from_entity_id, r2.from_entity_id
-- require at least 2 distinct shared edges (not just 1 shared genre) to count as similar
having count(*) >= 2
   and least(1.0, sum(
        case r1.relation_type
            when 'directed_by' then 0.55
            when 'has_genre'   then 0.08
            when 'acted_in'    then 0.15
            else 0.05
        end
)) >= 0.25
on conflict (from_entity_id, to_entity_id, relation_type)
do update set weight = excluded.weight;
"""


async def main():
    async with AsyncSessionLocal() as db:
        await db.execute(text(CLEAR_OLD_SQL))
        result = await db.execute(text(COMPUTE_SIMILARITY_SQL))
        await db.commit()
        print(f"similarity graph updated. rows affected: {result.rowcount}")


if __name__ == "__main__":
    asyncio.run(main())
