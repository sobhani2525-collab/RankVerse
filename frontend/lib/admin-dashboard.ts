/** Shape of GET /admin/dashboard/stats (app/modules/admin/dashboard_schemas.py). */

export interface DashboardTrend {
  total: number;
  last_7d: number;
  change_pct: number | null;
}

export interface DashboardDay {
  date: string; // Tehran calendar day, YYYY-MM-DD
  signups: number;
  votes: number;
  ratings: number;
  comments: number;
}

export interface AdminDashboardStats {
  users: { total: number; new_7d: number; new_7d_change_pct: number | null; active_today: number; active_7d: number };
  catalog: { movies: number; tv_series: number; people: number };
  lists: { total: number; public: number; new_7d: number };
  battles: { total: number; active: number; new_7d: number };
  votes: DashboardTrend;
  ratings: DashboardTrend;
  comments: DashboardTrend;
  inbox: { new_messages: number; open_alerts: number; critical_alerts: number };
  daily_battle: { scheduled_today: boolean; votes_today: number };
  days: DashboardDay[]; // oldest first, today last
  generated_at: string;
}
