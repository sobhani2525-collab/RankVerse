import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class DailyFilm(BaseModel):
    id: uuid.UUID
    slug: str
    title: str
    title_fa: str | None = None
    poster_path: str | None = None
    year: int | None = None
    computed_score: float | None = None


class DailyTheme(BaseModel):
    kind: str
    value: str


class DailyResults(BaseModel):
    left_votes: int
    right_votes: int
    total: int


class DailyPrevious(BaseModel):
    battle_date: date
    left: DailyFilm
    right: DailyFilm
    left_votes: int
    right_votes: int
    total: int
    winner: Literal["left", "right", "tie"]


class DailyBattleToday(BaseModel):
    battle_date: date
    daily_battle_id: uuid.UUID
    left: DailyFilm
    right: DailyFilm
    theme: DailyTheme
    my_choice: Literal["left", "right"] | None
    # Hidden until the caller has voted (no bandwagon effect); enforced here.
    results: DailyResults | None
    seconds_until_next: int
    # Consecutive days voted; None for guests.
    streak: int | None
    previous: DailyPrevious | None


class DailyVoteRequest(BaseModel):
    daily_battle_id: uuid.UUID
    choice: Literal["left", "right"]


class AdminThemeIn(BaseModel):
    kind: Literal["genre", "decade", "director", "pair"] = "pair"
    value: str = Field("", max_length=200)


class AdminDailyBattleCreate(BaseModel):
    battle_date: date
    left_id: uuid.UUID
    right_id: uuid.UUID
    theme: AdminThemeIn | None = None


class AdminDailyBattleUpdate(BaseModel):
    battle_date: date | None = None
    left_id: uuid.UUID | None = None
    right_id: uuid.UUID | None = None
    theme: AdminThemeIn | None = None


class AdminDailyBattleRow(BaseModel):
    id: uuid.UUID
    battle_date: date
    left: DailyFilm
    right: DailyFilm
    theme_kind: str
    theme_value: str
    source: str
    left_votes: int
    right_votes: int
    total: int
    left_percent: int | None
    right_percent: int | None
    editable: bool
    deletable: bool
