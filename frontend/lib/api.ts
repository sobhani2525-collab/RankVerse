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
