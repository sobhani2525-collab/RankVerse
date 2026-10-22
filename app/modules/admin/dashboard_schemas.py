from datetime import date, datetime

from pydantic import BaseModel


class DashboardTrend(BaseModel):
    """An all-time total plus the last 7 days against the 7 before them."""

    total: int
    last_7d: int
    change_pct: float | None = None  # null when the previous week had nothing to compare to


class DashboardUsers(BaseModel):
    total: int
    new_7d: int
    new_7d_change_pct: float | None = None
    active_today: int  # logged in since Tehran midnight
    active_7d: int


class DashboardCatalog(BaseModel):
    movies: int
    tv_series: int
    people: int


class DashboardLists(BaseModel):
    total: int  # the per-user "will watch" system lists are not counted
    public: int
    new_7d: int


class DashboardBattles(BaseModel):
    total: int  # drafts not counted
    active: int
    new_7d: int


class DashboardInbox(BaseModel):
    new_messages: int
    open_alerts: int
    critical_alerts: int


class DashboardDailyBattle(BaseModel):
    scheduled_today: bool
    votes_today: int


class DashboardDay(BaseModel):
    date: date  # Tehran calendar day
    signups: int
    votes: int
    ratings: int
    comments: int


class AdminDashboardStats(BaseModel):
    users: DashboardUsers
    catalog: DashboardCatalog
    lists: DashboardLists
    battles: DashboardBattles
    # votes = classic pair votes + pool-battle picks + bracket votes + daily-battle votes
    votes: DashboardTrend
    ratings: DashboardTrend
    # comments on titles/people and on lists
    comments: DashboardTrend
    inbox: DashboardInbox
    daily_battle: DashboardDailyBattle
    days: list[DashboardDay]  # oldest first, today last
    generated_at: datetime
