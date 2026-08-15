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

export interface MovieListItem {
  id: string;
  slug: string;
  title: string;
  poster_path: string | null;
  year: number | null;
  computed_score: number | null;
  total_votes: number;
}

export interface MovieDetail extends MovieListItem {
  overview: string | null;
  runtime: number | null;
  country: string | null;
  directors: PersonSummary[];
  cast: PersonSummary[];
  genres: GenreSummary[];
}
