import { Envelope, MovieDetail, MovieListItem } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

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
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json: Envelope<{ id: string; email: string; username: string }> = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || "Failed to fetch user");
  }
  return json.data;
}
