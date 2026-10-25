import type { Envelope } from "./types";
import type { ListSummary } from "./types";
import type { TournamentDetail, TournamentEntity, TournamentSummary } from "./tournament";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

/** Server-side anonymous read of a battle (metadata, OG image). null when private or missing. */
export async function getPublicBattle(slug: string): Promise<TournamentDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/battles/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json: Envelope<TournamentDetail> = await res.json();
    return json.error ? null : json.data;
  } catch {
    return null;
  }
}

export interface BattleRelatedData {
  /** Set for a finished tournament (the champion everything is related to); null for a pool battle. */
  winner: TournamentEntity | null;
  /** shared_count: entries a pool battle has in common with this one. */
  battles: (TournamentSummary & { shared_count?: number })[];
  lists: (ListSummary & { shared_item_count?: number })[];
}

/** Other public battles and lists the finished battle's winner appears in (empty until there is a winner). */
export async function getBattleRelated(slug: string): Promise<BattleRelatedData | null> {
  try {
    const res = await fetch(`${API_BASE}/battles/${encodeURIComponent(slug)}/related`, {
      next: { revalidate: 120 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json: Envelope<BattleRelatedData> = await res.json();
    return json.error ? null : json.data;
  } catch {
    return null;
  }
}

/** Public battles a movie / series is an entry of (its page's "related battles"); [] on any failure. */
export async function getBattlesWithEntity(entityId: string, limit = 4): Promise<TournamentSummary[]> {
  try {
    const res = await fetch(`${API_BASE}/battles/with-entity/${encodeURIComponent(entityId)}?limit=${limit}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json: Envelope<TournamentSummary[]> = await res.json();
    return json.error ? [] : json.data ?? [];
  } catch {
    return [];
  }
}
