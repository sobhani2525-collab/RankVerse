"""
Pure bracket logic for tournament battles -- no database, no clock, no global
randomness, so every rule here is deterministic and unit-testable.

Seeds are 1-based; a lower seed number is a "higher" seed. Bracket sizes are
powers of two, so there are no byes.
"""
import random
import uuid

BRACKET_SIZES = (4, 8, 16)


def total_rounds(size: int) -> int:
    if size not in BRACKET_SIZES:
        raise ValueError(f"unsupported bracket size {size}")
    return size.bit_length() - 1  # 4 -> 2, 8 -> 3, 16 -> 4


def standard_seed_order(size: int) -> list[int]:
    """Seeds in bracket-slot order, so the top seeds meet only late: for 8 it is
    [1, 8, 4, 5, 2, 7, 3, 6]. Slots (2i, 2i+1) are round 1's match i."""
    total_rounds(size)
    order = [1, 2]
    while len(order) < size:
        n = len(order) * 2
        order = [x for s in order for x in (s, n + 1 - s)]
    return order


def assign_seeds(entity_ids: list[uuid.UUID], seed_value: int | None) -> list[uuid.UUID]:
    """Entity ids listed from seed 1 down. seed_value None keeps the creator's
    order; otherwise a stored seed drives a reproducible shuffle (a private
    Random instance -- never hash() or the global generator)."""
    ordered = list(entity_ids)
    if seed_value is not None:
        random.Random(seed_value).shuffle(ordered)
    return ordered


def first_round_pairs(seeded_entities: list[uuid.UUID]) -> list[tuple[uuid.UUID, uuid.UUID]]:
    """seeded_entities[0] is seed 1. Returns round 1's (entity_a, entity_b) per position."""
    order = standard_seed_order(len(seeded_entities))
    slots = [seeded_entities[s - 1] for s in order]
    return [(slots[i], slots[i + 1]) for i in range(0, len(slots), 2)]


def pick_winner(
    entity_a: uuid.UUID, entity_b: uuid.UUID, votes_a: int, votes_b: int, seed_a: int, seed_b: int
) -> uuid.UUID:
    """More votes wins; a tie (including 0-0) goes to the lower seed number."""
    if votes_a != votes_b:
        return entity_a if votes_a > votes_b else entity_b
    return entity_a if seed_a < seed_b else entity_b


def feeder_positions(position: int) -> tuple[int, int]:
    """The two previous-round positions whose winners meet at `position`."""
    return 2 * position, 2 * position + 1
