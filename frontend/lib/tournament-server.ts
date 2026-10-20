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
  winner: TournamentEntity | null;
  battles: TournamentSummary[];
  lists: ListSummary[];
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
