import type { PersonListItem } from "./api";
export interface Envelope<T> {
  data: T;
  meta: { page?: number; page_size?: number; total?: number } | null;
  error: { code: string; message: string } | null;
}

// From GET /users/{username} -- the public profile lookup, deliberately
// carries no email (unlike the authenticated user object from auth/me).
export interface PublicUser {
  id: string;
  username: string;
  created_at: string;
  display_name?: string | null;
  bio?: string | null;
  avatar_key?: string | null;
}

export interface PersonSummary {
  id: string;
  slug: string;
  title: string;
  title_fa?: string | null;
  image_url?: string | null;
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
  // Persian title from TMDb's fa-IR translation, when there is one distinct
  // from `title` -- null for anything not yet re-synced or with no Persian
  // translation available. Use displayTitle() from lib/title.ts to render.
  title_fa: string | null;
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

export interface ImdbInfo {
  imdb_id: string | null;
  imdb_rating: number | null;
  imdb_votes: number | null;
}

// Billed cast beyond the linked top 5: name/role/photo only, no person page.
export interface CastMember {
  name: string;
  character: string | null;
  image_url: string | null;
}

// Where a title can be watched. The target URL is not exposed: links go through
// the API's counted redirect (see lib/watch-links.ts).
export interface WatchLink {
  id: string;
  provider: string;
  provider_name: string;
  access_type: string;
  access_label: string;
  is_affiliate: boolean;
}

export interface MovieDetail extends MovieListItem, ImdbInfo {
  id:string;
  overview: string | null;
  runtime: number | null;
  country: string | null;
  directors: PersonSummary[];
  cast: PersonSummary[];
  more_cast?: CastMember[];
  trailer_key?: string | null; // YouTube video id
  aparat_trailer?: string | null; // Aparat video hash, set by an admin
  watch_links?: WatchLink[];
  genres: GenreSummary[];
}

export interface TvSeriesDetail extends MovieListItem, ImdbInfo {
  overview: string | null;
  number_of_seasons: number | null;
  number_of_episodes: number | null;
  status: string | null;
  first_air_date: string | null;
  last_air_date: string | null;
  country: string | null;
  creators: PersonSummary[];
  directors: PersonSummary[];
  cast: PersonSummary[];
  more_cast?: CastMember[];
  trailer_key?: string | null; // YouTube video id
  aparat_trailer?: string | null; // Aparat video hash, set by an admin
  watch_links?: WatchLink[];
  genres: GenreSummary[];
  networks: GenreSummary[];
}

export interface PersonDetail {
  id: string;
  slug: string;
  title: string;
  title_fa?: string | null;
  biography: string | null;
  media: MediaInfo;
  directed: MovieListItem[];
  created: MovieListItem[];
  acted_in: MovieListItem[];
  tracks: MovieListItem[];
  albums: MovieListItem[];
  related_people: PersonListItem[];
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
  title_fa?: string | null;
  // The only field that resolves a person's photo -- people store it under
  // attributes["profile_path"], not poster_path. Prefer media.image_url
  // over building a URL from poster_path (see lib/list-constellation's
  // entityPosterUrl).
  media?: MediaInfo;
}

/** A graph neighbour (person/genre) linked from a list item. */
export interface EntityRef {
  id: string;
  slug: string;
  title: string;
  title_fa?: string | null;
  entity_type: string;
}

export type ListType = "ranked" | "community_ordered";
export type ListContributionMode = "owner_only" | "anyone" | "followers_only";

export interface ListItem {
  id: string;
  position: number;
  note: string | null;
  added_at: string;
  added_by_user_id: string;
  like_score: number | null;
  like_count: number;
  dislike_count: number;
  is_own: boolean;
  can_remove: boolean;
  my_vote: boolean | null;
  entity: EntityMini;
  year?: number | null;
  director?: EntityRef | null;
  lead_actor?: EntityRef | null;
  genres?: EntityRef[];
  /** Only present when the entity has a ranking row -- never a placeholder. */
  composite_score?: number | null;
  /** fa-IR synopsis, else the English one. */
  overview?: string | null;
}

/** GET /lists/{slug}/candidates -- an entity the viewer could add, with the
 * same graph fields as a ListItem so the add form can explain the link. */
export interface ListCandidate {
  entity: EntityMini;
  year: number | null;
  director: EntityRef | null;
  lead_actor: EntityRef | null;
  genres: EntityRef[];
  overview: string | null;
  /** How the server connects it to the list (people, works, genres); absent on older servers. */
  reason?: {
    strength: number;
    kind: "people" | "genre" | "title" | "none";
    text: string;
    score: number;
  } | null;
}

/** Why display rank `from_rank` connects to `from_rank + 1`. */
export interface ListEdge {
  from_rank: number;
  kind: "people" | "genre" | "none";
  label_fa: string | null;
  value: string | null;
  targets: EntityRef[];
}

/** Rank `rank` also shares a person with earlier rank `target_position`. */
export interface ListBacklink {
  rank: number;
  target_position: number;
  person_name: string;
  person_name_fa?: string | null;
  person_slug: string;
}

export interface ListDnaCount {
  entity: EntityRef;
  count: number;
}

export interface ListDna {
  type_counts: Record<string, number>;
  genres: ListDnaCount[];
  hubs: ListDnaCount[];
  decades: { decade: number; count: number }[];
}

export interface ListBattlePair {
  left_rank: number;
  right_rank: number;
  category: string;
  kind: "director" | "actor";
  label_fa: string;
  person: EntityRef;
  pair_count: number;
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
  list_type: ListType;
  contribution_mode: ListContributionMode;
  view_count: number;
  like_count: number;
  comment_count: number;
  follower_count: number;
  created_at: string;
  owner_username: string | null;
  owner_avatar_key?: string | null;
  owner_display_name?: string | null;
  /** Admin-picked featured list (card badge). */
  is_featured?: boolean;
  // First few items (position order) -- only populated by /lists
  // (discoverLists); see app/modules/lists/service.py's discover().
  preview_items: EntityMini[];
}

export interface ListDetail extends ListSummary {
  updated_at?: string | null;
  items: ListItem[];
  is_liked: boolean;
  is_following: boolean;
  is_owner: boolean;
  edges?: ListEdge[];
  backlinks?: ListBacklink[];
  dna?: ListDna | null;
  contributor_count?: number;
  is_active?: boolean;
  battle_pair?: ListBattlePair | null;
}

/** GET /lists/{slug}/related -- each carries why it's related. */
export interface RelatedListSummary extends ListSummary {
  shared_item_count: number;
  shared_tag: string | null;
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
  title_fa: string | null;
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
  title_fa: string | null;
  entity_type: string;
  poster_path: string | null;
  computed_score: number | null;
}

export interface SuggestedBattle {
  category: string;
  left: SuggestedBattleEntity;
  right: SuggestedBattleEntity;
}

// From GET /battles/themed: a run of movies sharing a genre / decade /
// director. items[0] opens as the champion. For a decade, `value` is its
// first year ("1990").
export interface ThemedBattleItem {
  id: string;
  slug: string;
  title: string;
  title_fa: string | null;
  entity_type: string;
  poster_path: string | null;
  year: number | null;
  computed_score: number | null;
}

export interface ThemedBattle {
  category: string;
  theme: { kind: "genre" | "decade" | "director" | "pair"; value: string; personalized: boolean };
  items: ThemedBattleItem[];
}

export interface CastVoteResponse {
  vote_id: string;
  left_item: string;
  right_item: string;
  left_score_before: number;
  right_score_before: number;
  left_score_after: number;
  right_score_after: number;
  left_computed_score?: number | null;
  right_computed_score?: number | null;
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
  /** 0-100, 50 = average (preference + choice lift, see TasteDimensionComputer). */
  score: number;
  confidence: number;
  sample_size: number;
  updated_at: string | null;
  /** Preference 0-1, 0.5 = neutral. Null until the profile is recomputed as genre-v2. */
  affinity?: number | null;
  /** How many times the platform's base rate the user picks this genre (1 = average). */
  lift?: number | null;
  /** A few of the user's liked titles in this genre -- what its place is built from. */
  examples?: { slug: string; title: string; title_fa?: string | null; entity_type: string }[];
}

export interface TasteAnchorEntity {
  id: string;
  slug: string;
  title: string;
  entity_type: string;
  poster_path: string | null;
  title_fa?: string | null;
}

export interface TasteAnchor {
  entity: TasteAnchorEntity;
  anchor_strength: string; // "primary" | "strong_signal"
  match_score: number;
  rank: number;
  /** The user's own 1-5 rating of it. */
  user_rating?: number | null;
}

// From GET /users/me/predicted-picks -- a separate, lazily-fetched endpoint
// from the rest of TasteProfile below (see the backend router's docstring:
// it's a live multi-join query, not a read of precomputed derived data).
export interface PredictedPick {
  entity: TasteAnchorEntity;
  match_score: number;
  /** The user's liked genre slugs this title has, strongest first. */
  reason_genres?: string[];
  year?: number | null;
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
  favorites_count?: number;
  contribution_score: number;
  updated_at: string;
}

export interface TastePerson {
  entity: { id: string; slug: string; title: string; title_fa?: string | null; profile_path?: string | null };
  /** 0-100 relative to the user's top person in the same role. */
  score: number;
  /** Liked titles behind it. */
  sample_size: number;
}

export interface TasteShare {
  /** Decade's first year ("1990") or ISO 3166-1 country code. */
  key: string;
  /** Percent of the user's liked-title weight. */
  share: number;
  sample_size: number;
}

export interface TasteFacets {
  directors: TastePerson[];
  actors: TastePerson[];
  decades: TasteShare[];
  countries: TasteShare[];
}

export interface RatingStyle {
  ratings_count: number;
  user_avg: number;
  platform_avg: number | null;
}

export interface ConfidenceHint {
  /** Next model_confidence milestone, 0-1. */
  next_target: number;
  /** At most this many more ratings reach it. */
  ratings_needed: number;
}

export interface TasteProfile {
  snapshot: TasteSnapshot | null;
  dimensions: TasteDimension[];
  anchors: TasteAnchor[];
  insight: TasteInsight | null;
  contribution_stats: ContributionStats | null;
  facets?: TasteFacets;
  rating_style?: RatingStyle | null;
  confidence_hint?: ConfidenceHint | null;
}

// --- Daily battle (GET/POST /daily-battle, raw JSON like /battles) ---

export interface DailyFilm {
  id: string;
  slug: string;
  title: string;
  title_fa: string | null;
  poster_path: string | null;
  year: number | null;
  computed_score: number | null;
}

export type DailySide = "left" | "right";

export interface DailyResults {
  left_votes: number;
  right_votes: number;
  total: number;
}

export interface DailyPrevious extends DailyResults {
  battle_date: string;
  left: DailyFilm;
  right: DailyFilm;
  winner: DailySide | "tie";
}

export interface DailyBattleToday {
  battle_date: string;
  daily_battle_id: string;
  left: DailyFilm;
  right: DailyFilm;
  theme: { kind: "genre" | "decade" | "director" | "pair"; value: string };
  my_choice: DailySide | null;
  /** null until the caller has voted (enforced by the server). */
  results: DailyResults | null;
  seconds_until_next: number;
  /** Consecutive days voted; null for guests. */
  streak: number | null;
  previous: DailyPrevious | null;
}
