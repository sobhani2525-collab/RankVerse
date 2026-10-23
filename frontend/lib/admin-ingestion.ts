/** Admin ingestion page: /admin/ingestion/* (app/modules/admin/ingestion_schemas.py). */

export type SyncEntityType = "movie" | "tv_series";

export interface IngestionTypeStats {
  entity_type: string;
  total: number;
  added_7d: number;
  added_30d: number;
  changed_7d: number;
  unchanged_180d: number;
  last_added_at: string | null;
  last_changed_at: string | null;
  sources: Record<string, number>;
}

export interface IngestionTitle {
  id: string;
  entity_type: SyncEntityType;
  title: string;
  title_fa: string | null;
  slug: string;
  tmdb_id: string | null;
  vote_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface AdminIngestionOverview {
  sources: { tmdb_configured: boolean; tmdb_base_url: string; translation_configured: boolean; translation_model: string };
  types: IngestionTypeStats[];
  coverage: {
    entity_type: SyncEntityType;
    total: number;
    with_imdb_id: number;
    with_imdb_rating: number;
    overview_sources: Record<string, number>;
  }[];
  biography_sources: Record<string, number>;
  recent: IngestionTitle[];
  stale: IngestionTitle[];
  runs: { created_at: string; admin_email: string; action: string; target_id: string; after: Record<string, unknown> | null }[];
  sync_alerts: { open: number; last_title: string | null; last_seen_at: string | null };
  generated_at: string;
}

export interface TmdbCheck {
  ok: boolean;
  status: number | null;
  ms: number;
  message: string;
}

export interface IngestionSyncResult {
  id: string;
  entity_type: SyncEntityType;
  title: string;
  slug: string;
  created: boolean;
}

/**
 * A TMDb id typed by hand, or pasted as a TMDb page link
 * ("https://www.themoviedb.org/tv/1396-breaking-bad"), which also says which kind it is.
 */
export function parseTmdbInput(input: string): { id: number; type: SyncEntityType | null } | null {
  const text = input.trim();
  const link = /themoviedb\.org\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?(movie|tv)\/(\d+)/.exec(text);
  if (link) return { id: Number(link[2]), type: link[1] === "tv" ? "tv_series" : "movie" };
  if (/^\d{1,8}$/.test(text)) return { id: Number(text), type: null };
  return null;
}
