"""rescale user_ratings.score from 1-10 to 1-5

Revision ID: ccf13541a965
Revises: e2a7c9f14d6b
Create Date: 2026-09-19

Replaces the ten-point rating scale with a five-star (integer, no half
stars) scale. Existing scores are rescaled with round(old_score / 2),
clamped to [1, 5] -- implemented as FLOOR(score / 2.0 + 0.5) rather than
SQL ROUND() because ROUND()'s tie-breaking behavior on exact .5 values
differs across numeric types/dialects (round-half-to-even vs
round-half-away-from-zero); FLOOR(x + 0.5) is an unambiguous round-half-up
that every old score maps through predictably:

    old: 1  2  3  4  5  6  7  8  9  10
    new: 1  1  2  2  3  3  4  4  5  5

Idempotency: re-running this migration (e.g. after a partial failure)
must not halve already-converted 1-5 scores a second time. Rather than
relying on a heuristic over the data itself (a real 1-5 score of, say, 3
is indistinguishable from an unconverted 1-10 score of 3), this gates the
data rewrite on the actual CHECK constraint definition currently in the
database: only rescale while ck_rating_range still allows up to 10.

Downgrade rescales back with score * 2 (clamped to [1, 10]) -- this is
lossy (it can't recover the original value once two old scores have
collapsed onto the same new one) and is provided only so the schema
constraint can be rolled back consistently with the data.
"""
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "ccf13541a965"
down_revision: Union[str, None] = "e2a7c9f14d6b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONSTRAINT_NAME = "ck_rating_range"
_TABLE_NAME = "user_ratings"


def _current_constraint_def(conn) -> str | None:
    # _TABLE_NAME is a fixed internal constant (not user input), so it's
    # safe to inline into the regclass cast -- a bind param followed
    # immediately by "::regclass" trips up the driver's param parser.
    return conn.execute(
        sa.text(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
            f"WHERE conname = :name AND conrelid = '{_TABLE_NAME}'::regclass"
        ),
        {"name": _CONSTRAINT_NAME},
    ).scalar()


def _allows_upper_bound(constraint_def: str | None, upper_bound: int) -> bool:
    """True if constraint_def contains a "<= upper_bound" bound (as a whole
    number, so 5 doesn't false-match inside e.g. 50)."""
    if not constraint_def:
        return False
    return re.search(rf"<=\s*{upper_bound}\b", constraint_def) is not None


def upgrade() -> None:
    conn = op.get_bind()
    needs_rescale = _allows_upper_bound(_current_constraint_def(conn), 10)

    op.drop_constraint(_CONSTRAINT_NAME, _TABLE_NAME, type_="check")

    if needs_rescale:
        conn.execute(
            sa.text(
                f"UPDATE {_TABLE_NAME} "
                "SET score = LEAST(5, GREATEST(1, FLOOR(score / 2.0 + 0.5)::int))"
            )
        )

    op.create_check_constraint(_CONSTRAINT_NAME, _TABLE_NAME, "score >= 1 AND score <= 5")


def downgrade() -> None:
    conn = op.get_bind()
    needs_restore = _allows_upper_bound(_current_constraint_def(conn), 5)

    op.drop_constraint(_CONSTRAINT_NAME, _TABLE_NAME, type_="check")

    if needs_restore:
        conn.execute(
            sa.text(f"UPDATE {_TABLE_NAME} SET score = LEAST(10, GREATEST(1, score * 2))")
        )

    op.create_check_constraint(_CONSTRAINT_NAME, _TABLE_NAME, "score >= 1 AND score <= 10")
