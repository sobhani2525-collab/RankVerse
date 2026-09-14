import uuid
from datetime import datetime

from app.config import settings


def compute_like_score(likes: int, dislikes: int) -> float:
    """Bayesian-average of an item's like ratio, shrunk toward the global
    prior when the vote count is low. See list_item_score_k/global_avg
    in app/config.py — no time decay, no dynamic prior (deferred)."""
    k = settings.list_item_score_k
    global_avg = settings.list_item_score_global_avg
    return (k * global_avg + likes) / (k + likes + dislikes)


def community_order_key(item_id: uuid.UUID, like_score: float | None, added_at: datetime) -> tuple:
    """Sort key for community_ordered lists: score DESC, then added_at,
    then the item id itself for full determinism (never hash())."""
    score = like_score if like_score is not None else settings.list_item_score_global_avg
    return (-score, added_at, item_id.int)
