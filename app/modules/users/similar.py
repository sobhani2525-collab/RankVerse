"""Taste-alike users (rating agreement on co-rated titles) and the follow toggle."""
import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.models import User, UserFollow, UserRating

MIN_COMMON = 3  # co-rated titles needed before a percentage means anything
RATING_SPAN = 4  # scores run 1..5


def agreement_percent(mean_abs_diff: float) -> int:
    """0 average difference -> 100%, the full 1..5 span -> 0%."""
    return max(0, min(100, round(100 * (1 - mean_abs_diff / RATING_SPAN))))


async def similar_users(db: AsyncSession, user_id: uuid.UUID, limit: int = 8) -> list[dict]:
    mine = UserRating.__table__.alias("mine")
    theirs = UserRating.__table__.alias("theirs")
    diff = func.avg(func.abs(mine.c.score - theirs.c.score))
    common = func.count()
    rows = (
        await db.execute(
            select(theirs.c.user_id, diff.label("diff"), common.label("common"))
            .select_from(mine.join(theirs, mine.c.entity_id == theirs.c.entity_id))
            .where(mine.c.user_id == user_id, theirs.c.user_id != user_id)
            .group_by(theirs.c.user_id)
            .having(common >= MIN_COMMON)
            .order_by(diff.asc(), common.desc())
            .limit(limit * 3)
        )
    ).all()
    if not rows:
        return []
    users = {
        u.id: u
        for u in (
            await db.execute(select(User).where(User.id.in_([r.user_id for r in rows]), User.is_active.is_(True), User.deleted_at.is_(None)))
        ).scalars()
    }
    following = {
        f for (f,) in (await db.execute(select(UserFollow.followee_id).where(UserFollow.follower_id == user_id))).all()
    }
    out = []
    for r in rows:
        u = users.get(r.user_id)
        if u is None:
            continue
        out.append(
            {
                "id": u.id,
                "username": u.username,
                "display_name": u.display_name,
                "avatar_key": u.avatar_key,
                "match_percent": agreement_percent(float(r.diff)),
                "common_count": r.common,
                "following": u.id in following,
            }
        )
    return out[:limit]


async def toggle_follow(db: AsyncSession, follower_id: uuid.UUID, followee_id: uuid.UUID) -> bool | None:
    """Flips the follow; returns the new state, or None if the target doesn't exist / is the caller."""
    if follower_id == followee_id or await db.get(User, followee_id) is None:
        return None
    existing = await db.execute(
        delete(UserFollow).where(UserFollow.follower_id == follower_id, UserFollow.followee_id == followee_id)
    )
    if existing.rowcount:
        return False
    db.add(UserFollow(follower_id=follower_id, followee_id=followee_id))
    return True
