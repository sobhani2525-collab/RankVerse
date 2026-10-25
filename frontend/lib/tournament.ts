import { authFetchEnvelope } from "./api";
import { proxyTmdbUrl } from "./tmdb-image-url";
import type { Envelope } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

export type TournamentEntityType = "movie" | "tv_series";
export type BracketSize = 4 | 8 | 16;
export type TournamentStatus = "draft" | "active" | "completed" | "archived";
export type TournamentVisibility = "draft" | "unlisted" | "public";

export const ENTITY_TYPE_LABELS: Record<TournamentEntityType, string> = {
  movie: "فیلم",
  tv_series: "سریال",
};

export const DURATION_OPTIONS: { label: string; seconds: number | null }[] = [
  { label: "۱ ساعت", seconds: 3600 },
  { label: "۶ ساعت", seconds: 6 * 3600 },
  { label: "۲۴ ساعت", seconds: 24 * 3600 },
  { label: "۳ روز", seconds: 3 * 86400 },
  { label: "دستی (سازنده می‌بندد)", seconds: null },
];

export interface TournamentEntity {
  id: string;
  slug: string;
  entity_type: string;
  title: string;
  title_fa: string | null;
  poster_url: string | null;
  year?: number | null;
  seed?: number;
}

export type BattleMode = "pool" | "tournament";

export interface TournamentSummary {
  slug: string;
  mode: BattleMode;
  title: string;
  description: string | null;
  cover_url: string | null;
  entity_type: TournamentEntityType;
  bracket_size: BracketSize;
  visibility: TournamentVisibility;
  status: TournamentStatus;
  is_official: boolean;
  round_duration_seconds: number | null;
  current_round: number;
  total_rounds: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  is_owner: boolean;
  preview?: TournamentEntity[];
  winner?: TournamentEntity | null;
  /** List items only: who made it, how many people have played it, how many follow it. */
  creator?: { username: string; display_name: string | null; avatar_key: string | null } | null;
  players_count?: number;
  follower_count?: number;
}

export interface TournamentMatch {
  id: string;
  position: number;
  status: "pending" | "open" | "closed";
  opens_at: string | null;
  closes_at: string | null;
  entity_a: TournamentEntity | null;
  entity_b: TournamentEntity | null;
  winner_entity_id: string | null;
  votes_a: number | null;
  votes_b: number | null;
  my_vote: string | null;
}

export interface TournamentDetail extends TournamentSummary {
  participants: TournamentEntity[];
  rounds: { round: number; matches: TournamentMatch[] }[];
  winner: TournamentEntity | null;
  current_round_closes_at: string | null;
  total_votes: number;
  follower_count: number;
  is_following: boolean;
  creator?: { username: string; display_name: string | null; avatar_key: string | null } | null;
  /** Pool battles: all picks, the viewer's own, and the standings (null until the viewer has played). */
  total_picks?: number;
  my_pick_count?: number;
  leaderboard?: LeaderboardRow[] | null;
}

export interface LeaderboardRow {
  entity_id: string;
  entity: TournamentEntity;
  wins: number;
  played: number;
  win_rate: number | null;
  seed: number;
  /** Shared between entries that are level on win rate, wins and head-to-head. */
  rank: number;
}

export interface CandidateEntity extends TournamentEntity {
  year: number | null;
  score: number | null;
}

export interface GenreOption {
  slug: string;
  title: string;
  title_fa: string | null;
}

/** TMDb poster paths ("/abc.jpg") become proxied image urls; full urls pass through. */
export function posterSrc(entity: { poster_url: string | null }, size: "w185" | "w342" = "w342"): string | null {
  const raw = entity.poster_url;
  if (!raw) return null;
  return raw.startsWith("/") ? proxyTmdbUrl(`https://image.tmdb.org/t/p/${size}${raw}`) : raw;
}

async function call<T>(path: string, token: string | null, options: { method?: string; body?: unknown } = {}): Promise<T> {
  return (await callEnvelope<T>(path, token, options)).data;
}

/** Like call, but keeps the envelope's meta (paged reads need meta.total). */
async function callEnvelope<T>(path: string, token: string | null, options: { method?: string; body?: unknown } = {}): Promise<Envelope<T>> {
  if (token) return authFetchEnvelope<T>(`/battles${path}`, token, options);
  // Guests: public reads only.
  const res = await fetch(`${API_BASE}/battles${path}`, { cache: "no-store" });
  const json: Envelope<T> = await res.json();
  if (!res.ok || json.error) throw new TournamentApiError(res.status, json.error?.message || "خطا در دریافت اطلاعات");
  return json;
}

export class TournamentApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const tournamentApi = {
  list: (token: string | null, p: { page?: number; status?: string; entity_type?: string; sort?: string }) =>
    call<TournamentSummary[]>(`${qs({ ...p, page_size: 12 })}`, token),
  /** One page of the hub plus the total count, for a numbered pager. */
  listPage: async (token: string | null, p: { page?: number; page_size: number; status?: string; entity_type?: string; sort?: string; q?: string }) => {
    const json = await callEnvelope<TournamentSummary[]>(qs(p), token);
    return { items: json.data, total: json.meta?.total ?? null };
  },
  get: (slug: string, token: string | null) => call<TournamentDetail>(`/${slug}`, token),
  create: (token: string, body: { title: string; description?: string; entity_type: TournamentEntityType; bracket_size: BracketSize }) =>
    call<{ slug: string }>("", token, { method: "POST", body }),
  update: (token: string, slug: string, body: Partial<{ title: string; description: string; entity_type: TournamentEntityType; bracket_size: BracketSize }>) =>
    call<TournamentDetail>(`/${slug}`, token, { method: "PATCH", body }),
  setEntries: (token: string, slug: string, entityIds: string[]) =>
    call<TournamentDetail>(`/${slug}/entries`, token, { method: "PUT", body: { entity_ids: entityIds } }),
  publish: (token: string, slug: string, body: { randomize?: boolean; round_duration_seconds?: number | null; visibility: "unlisted" | "public" }) =>
    call<TournamentDetail>(`/${slug}/publish`, token, { method: "POST", body }),
  pick: (token: string, slug: string, body: { champion_id: string; challenger_id: string; winner_id: string }) =>
    call<{ recorded: boolean }>(`/${slug}/picks`, token, { method: "POST", body }),
  vote: (token: string, slug: string, matchId: string, entityId: string) =>
    call<TournamentDetail>(`/${slug}/matches/${matchId}/vote`, token, { method: "POST", body: { entity_id: entityId } }),
  follow: (token: string, slug: string, follow: boolean) =>
    call<{ is_following: boolean }>(`/${slug}/follow`, token, { method: follow ? "PUT" : "DELETE" }),
  featured: (token: string | null) => call<TournamentSummary[]>("/featured", token),
  /** One random featured battle with its entries, or null when none is featured. */
  featuredRandom: (token: string | null, exclude?: string) =>
    call<TournamentDetail | null>(`/featured/random${qs({ exclude })}`, token),
  mine: (token: string, p: { tab: string; page?: number }) =>
    call<TournamentSummary[]>(`/mine${qs({ ...p, page_size: 12 })}`, token),
  /** One page of /mine plus the total count (e.g. the profile's "battles played"). */
  minePage: async (token: string, p: { tab: string; page?: number; page_size: number }) => {
    const json = await callEnvelope<TournamentSummary[]>(`/mine${qs(p)}`, token);
    return { items: json.data, total: json.meta?.total ?? json.data.length };
  },
  closeRound: (token: string, slug: string) => call<TournamentDetail>(`/${slug}/close-round`, token, { method: "POST" }),
  finish: (token: string, slug: string) => call<TournamentDetail>(`/${slug}/finish`, token, { method: "POST" }),
  extend: (token: string, slug: string, seconds: number) =>
    call<TournamentDetail>(`/${slug}/extend`, token, { method: "POST", body: { seconds } }),
  setVisibility: (token: string, slug: string, visibility: "unlisted" | "public") =>
    call<TournamentDetail>(`/${slug}/visibility`, token, { method: "POST", body: { visibility } }),
  remove: (token: string, slug: string) => call<{ result: "deleted" | "archived" }>(`/${slug}`, token, { method: "DELETE" }),
  candidates: (
    token: string,
    p: { entity_type: string; person?: string; role?: string; genre?: string; decade?: number; q?: string; page?: number }
  ) => call<CandidateEntity[]>(`/candidates${qs({ ...p, page_size: 24 })}`, token),
  genres: (token: string) => call<GenreOption[]>("/filter-genres", token),
};

export function tournamentHref(slug: string): string {
  return `/battles/${slug}`;
}

export function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "فینال";
  if (fromEnd === 1) return "نیمه‌نهایی";
  if (fromEnd === 2) return "یک‌چهارم نهایی";
  return "یک‌هشتم نهایی";
}

export const STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: "پیش‌نویس",
  active: "در جریان",
  completed: "پایان‌یافته",
  archived: "بایگانی‌شده",
};

/** "۲ ساعت و ۵ دقیقه" style remaining time; null once the deadline has passed. */
export function remainingFa(iso: string, now: number): string | null {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const fa = (n: number) => n.toLocaleString("fa-IR");
  if (d > 0) return `${fa(d)} روز و ${fa(h)} ساعت`;
  if (h > 0) return `${fa(h)} ساعت و ${fa(m)} دقیقه`;
  return `${fa(m)}:${fa(sec).padStart(2, "۰")}`;
}
