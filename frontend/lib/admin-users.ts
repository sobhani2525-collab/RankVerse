export type UserStatus = "active" | "blocked" | "deleted";

export interface AdminUserRow {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  avatar_key: string | null;
  status: UserStatus;
  email_verified: boolean;
  created_at: string;
  last_login_at: string | null;
  ratings_count: number;
  lists_count: number;
  comments_count: number;
}

export interface AdminUserStats {
  total: number;
  new_7d: number;
  new_7d_change_pct: number | null;
  new_30d: number;
  new_30d_change_pct: number | null;
  active_today: number;
  blocked: number;
  unverified: number;
  deleted: number;
}

interface AdminEnvelope<T> {
  data: T;
  meta?: { page?: number; page_size?: number; total?: number } | null;
  error?: { message: string } | null;
}

/** Calls /api/admin/users/... (the cookie-to-Bearer proxy); throws Error(message) on failure. */
export async function adminUsersCall<T>(path: string, init?: RequestInit): Promise<AdminEnvelope<T>> {
  const res = await fetch(`/api/admin/users${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  const json: AdminEnvelope<T> | null = await res.json().catch(() => null);
  if (!res.ok || !json || json.error) throw new Error(json?.error?.message || `خطا (${res.status})`);
  return json;
}
