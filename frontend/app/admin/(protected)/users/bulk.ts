import { adminUsersCall } from "@/lib/admin-users";

export type BulkAction = "block" | "unblock" | "delete" | "restore" | "verify_email";

export interface BulkResult {
  succeeded: string[];
  failed: { id: string; reason: string }[];
  skipped: string[];
}

/** Backend cap on ids per bulk request / per export-by-ids. */
export const MAX_BULK_IDS = 500;

const FILTER_KEYS = ["q", "status", "email_verified", "created_from", "created_to", "last_login_from", "last_login_to", "never_logged_in"] as const;

export function startOfDayIso(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}
export function endOfDayIso(day: string): string {
  return new Date(`${day}T23:59:59.999`).toISOString();
}

/** The list filters in the URL, normalised the way the API wants them (date inputs become ISO instants). */
export function filterParams(sp: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = sp.get(k);
    if (!v) continue;
    if (k === "created_from" || k === "last_login_from") out.set(k, startOfDayIso(v));
    else if (k === "created_to" || k === "last_login_to") out.set(k, endOfDayIso(v));
    else out.set(k, v);
  }
  return out;
}

/** The same filters as a JSON body for POST /bulk ("all matching results" mode). */
export function filterBody(sp: URLSearchParams): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  filterParams(sp).forEach((v, k) => {
    body[k] = k === "email_verified" || k === "never_logged_in" ? v === "true" : v;
  });
  return body;
}

export async function runBulk(
  action: BulkAction,
  target: { ids: string[] } | { filter: Record<string, unknown> },
  reason?: string,
): Promise<BulkResult> {
  const res = await adminUsersCall<BulkResult>("/bulk", {
    method: "POST",
    body: JSON.stringify({ action, ...target, ...(reason ? { reason } : {}) }),
  });
  return res.data;
}

/**
 * Downloads an export through the Next proxy (the admin token never reaches
 * this code). Fetch + blob rather than a plain link so a refusal (e.g. too
 * many rows) comes back as a readable error instead of a JSON page.
 */
export async function downloadExport(query: URLSearchParams, endpoint = "/api/admin/users/export"): Promise<void> {
  const res = await fetch(`${endpoint}?${query.toString()}`, { cache: "no-store" });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.error?.message || `خطا (${res.status})`);
  }
  const disposition = res.headers.get("content-disposition") ?? "";
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? `users.${query.get("format") ?? "csv"}`;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
