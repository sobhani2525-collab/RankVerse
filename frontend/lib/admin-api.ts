import { Envelope } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

export interface AdminAccount {
  id: string;
  email: string;
  role: string;
  last_login_at: string | null;
}

export interface AdminTokenResponse {
  access_token: string;
  token_type: string;
  admin: AdminAccount;
}

async function adminEnvelope<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  const json: Envelope<T> = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `RankVerse admin API error (${res.status}) on ${path}`);
  }
  return json.data;
}

export async function adminLogin(email: string, password: string): Promise<AdminTokenResponse> {
  return adminEnvelope<AdminTokenResponse>("/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export async function getAdminMe(token: string): Promise<AdminAccount> {
  return adminEnvelope<AdminAccount>("/admin/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}
