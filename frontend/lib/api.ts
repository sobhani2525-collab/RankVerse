import { Envelope, MovieDetail, MovieListItem, ListSummary, ListDetail, ListComment, BattleEntity, NextBattleResponse, CastVoteResponse, VoteOutcome } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

export const ACCESS_TOKEN_STORAGE_KEY = "rankverse_token";
export const REFRESH_TOKEN_STORAGE_KEY = "rankverse_refresh_token";

// --- Silent token refresh ---
//
// authFetch and every authenticated helper below route through
// fetchWithAuthRetry: on a 401, it uses the stored refresh token to get a
// new access token and retries the request once. Callers that hold their
// own copy of the access token (e.g. AuthProvider's React state) can stay
// in sync by subscribing via onAccessTokenRefreshed.

type TokenRefreshListener = (accessToken: string) => void;
let tokenRefreshListeners: TokenRefreshListener[] = [];

export function onAccessTokenRefreshed(listener: TokenRefreshListener): () => void {
  tokenRefreshListeners.push(listener);
  return () => {
    tokenRefreshListeners = tokenRefreshListeners.filter((l) => l !== listener);
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const qs = new URLSearchParams({ refresh_token: refreshToken });
  const res = await fetch(`${API_BASE}/auth/refresh?${qs.toString()}`, { method: "POST" });
  const json: Envelope<{ access_token: string; token_type: string }> = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || "Failed to refresh session");
  }
  return json.data.access_token;
}

async function fetchWithAuthRetry(path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (res.status !== 401 || typeof window === "undefined") {
    return res;
  }

  const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  if (!storedRefreshToken) {
    return res;
  }

  try {
    const newAccessToken = await refreshAccessToken(storedRefreshToken);
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, newAccessToken);
    tokenRefreshListeners.forEach((listener) => listener(newAccessToken));

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${newAccessToken}`);
    return fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    return res;
  }
}

async function fetchEnvelope<T>(path: string, revalidateSeconds = 300): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    next: { revalidate: revalidateSeconds },
  });

  if (!res.ok) {
    throw new Error(`RankVerse API error (${res.status}) on ${path}`);
  }

  const json: Envelope<T> = await res.json();
  if (json.error) {
    throw new Error(json.error.message);
  }
  return json.data;
}

export async function getTopMovies(params: {
  page?: number;
  page_size?: number;
  genre?: string;
} = {}): Promise<MovieListItem[]> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  if (params.genre) qs.set("genre", params.genre);

  return fetchEnvelope<MovieListItem[]>(`/rankings/movies?${qs.toString()}`);
}

export async function getMovieBySlug(slug: string): Promise<MovieDetail> {
  return fetchEnvelope<MovieDetail>(`/movies/${slug}`, 60);
}

async function postEnvelope<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json: Envelope<T> = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `RankVerse API error (${res.status}) on ${path}`);
  }
  return json.data;
}

export async function registerUser(payload: {
  email: string;
  username: string;
  password: string;
}) {
  return postEnvelope<{ id: string; email: string; username: string }>(
    "/auth/register",
    payload
  );
}

export async function loginUser(payload: { email: string; password: string }) {
  return postEnvelope<{ access_token: string; refresh_token: string }>(
    "/auth/login",
    payload
  );
}

export async function getMe(token: string) {
  return authFetch<{ id: string; email: string; username: string }>("/auth/me", token);
}

export interface UserRating {
  id: string;
  entity_id: string;
  score: number;
  movie_slug: string;
  movie_title: string;
  movie_poster_path: string | null;
}

export async function getMyRatings(token: string): Promise<UserRating[]> {
  return authFetch<UserRating[]>("/users/me/ratings", token);
}

export async function rateMovie(token: string, slug: string, score: number) {
  return authFetch<{ id: string; entity_id: string; score: number }>(
    `/movies/${slug}/rate`,
    token,
    { method: "POST", body: { score } }
  );
}

export async function unrateMovie(token: string, slug: string): Promise<{ deleted: boolean }> {
  return authFetch(`/movies/${slug}/rate`, token, { method: "DELETE" });
}

// --- Authenticated helper ---

async function authFetch<T>(
  path: string,
  token: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetchWithAuthRetry(path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const json: Envelope<T> = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `RankVerse API error (${res.status}) on ${path}`);
  }
  return json.data;
}

// --- Lists: public reads ---

export async function discoverLists(params: {
  page?: number;
  page_size?: number;
  entity_type?: string;
  tag?: string;
  sort?: "newest" | "popular";
} = {}): Promise<ListSummary[]> {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.page_size) qs.set("page_size", String(params.page_size));
  if (params.entity_type) qs.set("entity_type", params.entity_type);
  if (params.tag) qs.set("tag", params.tag);
  if (params.sort) qs.set("sort", params.sort);
  return fetchEnvelope<ListSummary[]>(`/lists?${qs.toString()}`, 60);
}

export async function getListBySlug(slug: string, token?: string | null): Promise<ListDetail> {
  if (token) {
    return authFetch<ListDetail>(`/lists/${slug}`, token);
  }
  const res = await fetch(`${API_BASE}/lists/${slug}`, { cache: "no-store" });
  const json: Envelope<ListDetail> = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || "Failed to fetch list");
  }
  return json.data;
}

export async function getListComments(slug: string): Promise<ListComment[]> {
  return fetchEnvelope<ListComment[]>(`/lists/${slug}/comments`, 30);
}

// --- Lists: authenticated writes ---

export async function createList(
  token: string,
  payload: {
    title: string;
    description?: string;
    entity_type?: string;
    is_ranked?: boolean;
    visibility?: string;
    tags?: string[];
  }
): Promise<{ id: string; slug: string }> {
  return authFetch(`/lists`, token, { method: "POST", body: payload });
}

export async function updateList(
  token: string,
  slug: string,
  payload: Partial<{
    title: string;
    description: string;
    visibility: string;
    cover_image_url: string;
    tags: string[];
  }>
): Promise<{ id: string; slug: string }> {
  return authFetch(`/lists/${slug}`, token, { method: "PUT", body: payload });
}

export async function deleteList(token: string, slug: string): Promise<{ deleted: boolean }> {
  return authFetch(`/lists/${slug}`, token, { method: "DELETE" });
}

export async function getMyLists(token: string): Promise<ListSummary[]> {
  return authFetch(`/users/me/lists`, token);
}

export async function addListItem(
  token: string,
  slug: string,
  payload: { entity_id: string; note?: string }
) {
  return authFetch(`/lists/${slug}/items`, token, { method: "POST", body: payload });
}

export async function removeListItem(token: string, slug: string, itemId: string) {
  return authFetch<{ deleted: boolean }>(`/lists/${slug}/items/${itemId}`, token, { method: "DELETE" });
}

export async function reorderListItems(token: string, slug: string, itemIds: string[]) {
  return authFetch<{ reordered: boolean }>(`/lists/${slug}/reorder`, token, {
    method: "PUT",
    body: { item_ids: itemIds },
  });
}

export async function toggleListLike(token: string, slug: string): Promise<{ liked: boolean }> {
  return authFetch(`/lists/${slug}/like`, token, { method: "POST" });
}

export async function toggleListFollow(token: string, slug: string): Promise<{ following: boolean }> {
  return authFetch(`/lists/${slug}/follow`, token, { method: "POST" });
}

export async function addListComment(
  token: string,
  slug: string,
  payload: { body: string; parent_comment_id?: string }
): Promise<ListComment> {
  return authFetch(`/lists/${slug}/comments`, token, { method: "POST", body: payload });
}

// --- Search (for adding items to a list) ---

export interface SearchResult {
  id: string;
  slug: string;
  title: string;
  type: string;
}

export async function searchEntities(q: string, type: string = "movie"): Promise<SearchResult[]> {
  if (!q.trim()) return [];
  const qs = new URLSearchParams({ q, type });
  const res = await fetch(`${API_BASE}/search?${qs.toString()}`, { cache: "no-store" });
  const json: Envelope<SearchResult[]> = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || "Search failed");
  }
  return json.data;
}

/**
 * IMPORTANT: unlike the rest of this file, the /battles endpoints do
 * NOT wrap their responses in the {data, meta, error} Envelope shape —
 * they return the raw JSON body directly. So these two functions parse
 * the response directly instead of going through authFetch, though they
 * still use fetchWithAuthRetry for the silent-refresh-on-401 behavior.
 * If the backend is ever updated to use the Envelope convention here
 * too, these two functions are the only place that needs to change.
 */

export async function getNextBattle(
  token: string,
  category: string = "movie"
): Promise<NextBattleResponse> {
  const qs = new URLSearchParams({ category });
  const res = await fetchWithAuthRetry(`/battles/next?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      body?.detail || `RankVerse API error (${res.status}) on /battles/next`
    );
  }
  return res.json();
}

export async function castBattleVote(
  token: string,
  payload: {
    category: string;
    left_item: string;
    right_item: string;
    winner: VoteOutcome;
  }
): Promise<CastVoteResponse> {
  const res = await fetchWithAuthRetry(`/battles/vote`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      body?.detail || `RankVerse API error (${res.status}) on /battles/vote`
    );
  }
  return res.json();
}

export interface RelatedEntity {
  id: string;
  title: string;
  slug: string;
  weight: number;
  relation_type: string;
  poster_path: string | null;
  reason: string | null;
}

export async function getRelatedEntities(entityId: string, limit: number = 6): Promise<RelatedEntity[]> {
  return fetchEnvelope<RelatedEntity[]>(`/entities/${entityId}/related?limit=${limit}`, 300);
}

