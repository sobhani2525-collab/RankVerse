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
