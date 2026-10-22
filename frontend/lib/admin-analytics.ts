/** Shape of GET /admin/analytics?days= (app/modules/admin/analytics_schemas.py). */

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export interface AnalyticsMetric {
  value: number;
  previous: number;
  change_pct: number | null;
}

export interface AnalyticsDay {
  date: string; // Tehran calendar day, YYYY-MM-DD
  signups: number;
  active_users: number;
  votes: number;
  ratings: number;
  comments: number;
}

export interface AnalyticsTopTitle {
  id: string;
  title: string;
  slug: string;
  entity_type: string;
  count: number;
  avg_score: number | null;
}

export interface AdminAnalytics {
  days_count: number;
  start: string;
  end: string;
  kpis: Record<
    | "signups"
    | "active_users"
    | "votes"
    | "ratings"
    | "comments"
    | "lists_created"
    | "list_likes"
    | "list_follows"
    | "battles_created",
    AnalyticsMetric
  >;
  activation: { signups: number; activated: number; rate_pct: number | null };
  days: AnalyticsDay[]; // oldest first, today last
  votes_by_source: { pair: number; pool: number; bracket: number; daily: number };
  daily_battle: { member_votes: number; guest_votes: number };
  rating_distribution: { score: number; count: number }[];
  top_chosen_titles: AnalyticsTopTitle[];
  top_rated_titles: AnalyticsTopTitle[];
  top_lists: { id: string; title: string; slug: string; owner_username: string; likes: number; follows: number }[];
  top_battles: { id: string; title: string; slug: string; picks: number; players: number }[];
  watch_providers: { provider: string; name: string; links: number; clicks: number }[];
  generated_at: string;
}
