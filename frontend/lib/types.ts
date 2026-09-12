export interface Envelope<T> {
  data: T;
  meta: { page?: number; page_size?: number; total?: number } | null;
  error: { code: string; message: string } | null;
}

export interface PersonSummary {
  id: string;
  slug: string;
  title: string;
  role: string | null;
}

export interface GenreSummary {
  id: string;
  slug: string;
  title: string;
}

export interface MediaInfo {
  image_url: string | null;
  audio_preview_url: string | null;
  video_url: string | null;
}

export interface MovieListItem {
  id: string;
  slug: string;
  title: string;
  // Defaults to "movie" server-side for entities synced before this field
  // existed -- lets a mixed list (a person's filmography, a genre page)
  // route each row to /movies/{slug} or /tv-series/{slug} correctly.
  entity_type: string;
  poster_path: string | null;
  year: number | null;
  computed_score: number | null;
  total_votes: number;
  media: MediaInfo;
}

export interface MovieDetail extends MovieListItem {
  id:string;
  overview: string | null;
  runtime: number | null;
  country: string | null;
  directors: PersonSummary[];
  cast: PersonSummary[];
  genres: GenreSummary[];
}

export interface TvSeriesDetail extends MovieListItem {
  overview: string | null;
  number_of_seasons: number | null;
  number_of_episodes: number | null;
  status: string | null;
  first_air_date: string | null;
  last_air_date: string | null;
  country: string | null;
  creators: PersonSummary[];
  cast: PersonSummary[];
  genres: GenreSummary[];
  networks: GenreSummary[];
}

export interface PersonDetail {
  id: string;
  slug: string;
  title: string;
  biography: string | null;
  media: MediaInfo;
  directed: MovieListItem[];
  created: MovieListItem[];
  acted_in: MovieListItem[];
  tracks: MovieListItem[];
  albums: MovieListItem[];
}

export interface GenreDetail {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  media: MediaInfo;
  movies: MovieListItem[];
  tv_series: MovieListItem[];
}

export interface AlbumSummary {
  id: string;
  slug: string;
  title: string;
}

export interface TrackDetail {
  id: string;
  slug: string;
  title: string;
  media: MediaInfo;
  artist: PersonSummary | null;
  album: AlbumSummary | null;
  other_tracks: MovieListItem[];
}

export interface EntityMini {
  id: string;
  slug: string;
  title: string;
  entity_type: string;
  poster_path: string | null;
}

export interface ListItem {
  id: string;
  position: number;
  note: string | null;
  added_at: string;
  entity: EntityMini;
}

export interface ListSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  entity_type: string | null;
  is_ranked: boolean;
  visibility: string;
  cover_image_url: string | null;
  tags: string[];
  view_count: number;
  like_count: number;
  comment_count: number;
  follower_count: number;
  created_at: string;
  owner_username: string | null;
}

export interface ListDetail extends ListSummary {
  items: ListItem[];
  is_liked: boolean;
  is_following: boolean;
  is_owner: boolean;
}

export interface ListComment {
  id: string;
  user_id: string;
  username: string | null;
  body: string;
  parent_comment_id: string | null;
  created_at: string;
}

/**
 * Append this block to the end of lib/types.ts.
 * (Kept as a separate file here just so it's easy to review/copy.)
 */

export type VoteOutcome = "left" | "right" | "skip";

export interface BattleEntity {
  id: string;
  title: string;
  /**
   * NOTE: despite the name, the backend currently returns whatever raw
   * value it finds in Entity.attributes (poster_path / poster_url /
   * image_url — whichever key exists first). For movies this is
   * typically a TMDB-style relative path like "/abc123.jpg", the same
   * shape MovieListItem.poster_path uses elsewhere in this app — so we
   * build the full image URL the same way EntityRow.tsx does.
   */
  poster_url: string | null;
  elo_score: number;
  matches_played: number;
}

export interface NextBattleResponse {
  category: string;
  left: BattleEntity;
  right: BattleEntity;
}

// From GET /movies|tv-series/{slug}/suggested-battle -- null for a guest
// or a user with no taste anchors yet (see the backend's
// SuggestedBattleService docstring for why there's no fallback pairing).
export interface SuggestedBattleEntity {
  id: string;
  slug: string;
  title: string;
  entity_type: string;
  poster_path: string | null;
  computed_score: number | null;
}

export interface SuggestedBattle {
  category: string;
  left: SuggestedBattleEntity;
  right: SuggestedBattleEntity;
}

export interface CastVoteResponse {
  vote_id: string;
  left_item: string;
  right_item: string;
  left_score_before: number;
  right_score_before: number;
  left_score_after: number;
  right_score_after: number;
  created_at: string;
}

// --- Taste DNA (GET /users/me/taste-dna) ---

export interface TasteSnapshot {
  label: string;
  model_confidence: number;
  entity_scope: string;
  computed_at: string;
  model_version: string;
}

export interface TasteDimension {
  dimension_type: string;
  dimension_key: string;
  score: number;
  confidence: number;
  sample_size: number;
  updated_at: string;
}

export interface TasteAnchorEntity {
  id: string;
  slug: string;
  title: string;
  entity_type: string;
  poster_path: string | null;
}

export interface TasteAnchor {
  entity: TasteAnchorEntity;
  anchor_strength: string; // "primary" | "strong_signal"
  match_score: number;
  rank: number;
}

// From GET /users/me/predicted-picks -- a separate, lazily-fetched endpoint
// from the rest of TasteProfile below (see the backend router's docstring:
// it's a live multi-join query, not a read of precomputed derived data).
export interface PredictedPick {
  entity: TasteAnchorEntity;
  match_score: number;
}

// user_taste_insights is single-row-per-user (see the backend's
// TasteRepository.replace_insight docstring) -- a single nullable object,
// not a list, mirroring `snapshot` and `contribution_stats` below.
export interface TasteInsight {
  id: string;
  insight_text: string;
  insight_tags: string[];
  generated_at: string;
}

export interface ContributionStats {
  votes_count: number;
  battles_count: number;
  comments_count: number;
  contribution_score: number;
  updated_at: string;
}

export interface TasteProfile {
  snapshot: TasteSnapshot | null;
  dimensions: TasteDimension[];
  anchors: TasteAnchor[];
  insight: TasteInsight | null;
  contribution_stats: ContributionStats | null;
}
