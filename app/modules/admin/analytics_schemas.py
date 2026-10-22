import uuid
from datetime import date, datetime

from pydantic import BaseModel


class AnalyticsMetric(BaseModel):
    """A count over the selected range against the same-length range before it."""

    value: int
    previous: int
    change_pct: float | None = None  # null when the previous range had nothing to compare to


class AnalyticsKpis(BaseModel):
    signups: AnalyticsMetric
    # distinct users who voted, rated, commented, made/liked/followed a list in the range
    active_users: AnalyticsMetric
    votes: AnalyticsMetric
    ratings: AnalyticsMetric
    comments: AnalyticsMetric
    lists_created: AnalyticsMetric
    list_likes: AnalyticsMetric
    list_follows: AnalyticsMetric
    battles_created: AnalyticsMetric


class AnalyticsActivation(BaseModel):
    signups: int
    activated: int  # signed up in the range and did at least one of the actions above
    rate_pct: float | None = None


class AnalyticsDay(BaseModel):
    date: date  # Tehran calendar day
    signups: int
    active_users: int
    votes: int
    ratings: int
    comments: int


class AnalyticsVotesBySource(BaseModel):
    pair: int  # classic "which one?" pair votes
    pool: int  # picks while playing a pool battle
    bracket: int  # votes in bracket-tournament matches
    daily: int  # daily-battle votes (members and guests)


class AnalyticsDailyBattle(BaseModel):
    member_votes: int
    guest_votes: int


class AnalyticsScoreCount(BaseModel):
    score: int
    count: int


class AnalyticsTopTitle(BaseModel):
    id: uuid.UUID
    title: str
    slug: str
    entity_type: str
    count: int
    avg_score: float | None = None  # only on the most-rated list


class AnalyticsTopList(BaseModel):
    id: uuid.UUID
    title: str
    slug: str
    owner_username: str
    likes: int
    follows: int


class AnalyticsTopBattle(BaseModel):
    id: uuid.UUID
    title: str
    slug: str
    picks: int
    players: int


class AnalyticsProvider(BaseModel):
    provider: str
    name: str
    links: int
    clicks: int  # all time: click_count has no date


class AdminAnalytics(BaseModel):
    days_count: int
    start: date
    end: date
    kpis: AnalyticsKpis
    activation: AnalyticsActivation
    days: list[AnalyticsDay]  # oldest first, today last
    votes_by_source: AnalyticsVotesBySource
    daily_battle: AnalyticsDailyBattle
    rating_distribution: list[AnalyticsScoreCount]  # scores 1..5, new ratings in the range
    top_chosen_titles: list[AnalyticsTopTitle]  # picked as the winner in any kind of battle
    top_rated_titles: list[AnalyticsTopTitle]
    top_lists: list[AnalyticsTopList]
    top_battles: list[AnalyticsTopBattle]
    watch_providers: list[AnalyticsProvider]
    generated_at: datetime
