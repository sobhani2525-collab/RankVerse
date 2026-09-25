import type { EntityRef, ListBacklink, ListCandidate, ListDetail, ListEdge, ListItem } from "./types";
import { toFaDigits } from "./format-number";
import { detailPathFor } from "./entity-routes";
import { genreLabel } from "./genre-labels";

/**
 * Shared helpers for the list detail "constellation" page
 * (components/list-detail/*): edge colors, type labels, poster urls.
 * Entity color code: movie/series = gold, people = violet, genre = teal,
 * year = neutral.
 */

export type EdgeKind = ListEdge["kind"];

export const EDGE_STYLES: Record<
  EdgeKind,
  { line: string; ring: string; dot: string; chip: string }
> = {
  people: {
    line: "border-solid border-violet-light",
    ring: "border-solid border-violet-light",
    dot: "bg-violet-light",
    chip: "border-violet-light/60 text-violet-light hover:border-violet-light",
  },
  genre: {
    line: "border-solid border-teal",
    ring: "border-solid border-teal",
    dot: "bg-teal",
    chip: "border-teal/60 text-teal hover:border-teal",
  },
  none: {
    line: "border-dashed border-dim/50",
    ring: "border-dashed border-dim/60",
    dot: "bg-dim/60",
    chip: "border-border text-dim",
  },
};

export const PEOPLE_CHIP = "border-violet-light/45 text-violet-light hover:border-violet-light";
export const GENRE_CHIP = "border-teal/45 text-teal hover:border-teal";
export const TAG_CHIP = "border-border text-muted";

const TYPE_LABELS: Record<string, { en: string; fa: string }> = {
  movie: { en: "MOVIE", fa: "فیلم" },
  tv_series: { en: "SERIES", fa: "سریال" },
  person: { en: "PERSON", fa: "شخص" },
  genre: { en: "GENRE", fa: "ژانر" },
  track: { en: "TRACK", fa: "قطعه" },
};

export function typeLabel(entityType: string): { en: string; fa: string } {
  return TYPE_LABELS[entityType] ?? { en: entityType.toUpperCase(), fa: entityType };
}

/** Entity types that can be rated (StarRating) and battled on this page. */
export function isRateable(entityType: string): boolean {
  return entityType === "movie" || entityType === "tv_series";
}

export function posterUrl(posterPath: string | null | undefined, size = "w342"): string | null {
  return posterPath ? `https://image.tmdb.org/t/p/${size}${posterPath}` : null;
}

export function entityHref(entityType: string, slug: string): string | null {
  return detailPathFor(entityType, slug);
}

/** The in-page battle section (ListBattlePreview) that each item's "نبرد" button scrolls to. */
export const BATTLE_SECTION_ID = "list-battle";

/** Entity types /battles/vote accepts. Mirrors BATTLE_TYPES in app/modules/lists/graph.py. */
export function isBattleable(entityType: string): boolean {
  return entityType === "movie" || entityType === "tv_series";
}

export interface BattleOpponent {
  /** Index into the list's items. */
  index: number;
  kind: EdgeKind;
  reason: string;
}

/**
 * Opponents for an in-page battle anchored on items[anchor], closest in
 * the graph first: shared director, then shared lead actor, then shared
 * genres, then no direct link -- ties keep list order. Only same-type
 * movie/tv_series items qualify, since /battles/vote rejects anything else.
 */
export function battleOpponents(items: ListItem[], anchor: number): BattleOpponent[] {
  const a = items[anchor];
  if (!a || !isBattleable(a.entity.entity_type)) return [];
  const anchorGenres = new Map((a.genres ?? []).map((g) => [g.id, g]));

  const ranked = items.flatMap((item, index): (BattleOpponent & { tier: number })[] => {
    if (index === anchor || item.entity.entity_type !== a.entity.entity_type) return [];
    if (a.director && item.director?.id === a.director.id) {
      return [{ tier: 0, index, kind: "people", reason: `هر دو ساخته ${a.director.title}` }];
    }
    if (a.lead_actor && item.lead_actor?.id === a.lead_actor.id) {
      return [{ tier: 1, index, kind: "people", reason: `${a.lead_actor.title} در هر دو` }];
    }
    const shared = (item.genres ?? []).filter((g) => anchorGenres.has(g.id));
    if (shared.length > 0) {
      const names = shared.map((g) => genreLabel(g.title)).join("، ");
      return [{ tier: 2, index, kind: "genre", reason: `ژانر مشترک: ${names}` }];
    }
    return [{ tier: 3, index, kind: "none", reason: "بدون اتصال مستقیم" }];
  });

  ranked.sort((x, y) => x.tier - y.tier || x.index - y.index);
  return ranked.map(({ index, kind, reason }) => ({ index, kind, reason }));
}

/** True when `iso` falls on today's date in Tehran. */
export function isUpdatedToday(iso: string, now: Date = new Date()): boolean {
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Tehran" });
  return day(new Date(iso)) === day(now);
}

/* ---------------------------------------------------------------------
   Client-side graph rules, for an item added optimistically (before the
   server's recomputed edges/backlinks arrive) and for the add form's
   reason line. They see only an item's director and lead actor, while the
   server also weighs every director/creator and the top-billed cast -- so
   the server's answer replaces these once the list is refetched.
   --------------------------------------------------------------------- */

type GraphFields = Pick<ListItem, "director" | "lead_actor" | "genres"> & { entity: { entity_type: string } };

const MAX_EDGE_GENRES = 2;

/** Shared director > shared lead actor > shared genres > none (ListService's rule). */
export function edgeBetween(a: GraphFields, b: GraphFields, fromRank: number, items: GraphFields[]): ListEdge {
  if (a.director && b.director && a.director.id === b.director.id) {
    const creator = a.entity.entity_type === "tv_series" || b.entity.entity_type === "tv_series";
    return {
      from_rank: fromRank, kind: "people", label_fa: creator ? "سازنده مشترک" : "کارگردان مشترک",
      value: a.director.title, targets: [a.director],
    };
  }
  if (a.lead_actor && b.lead_actor && a.lead_actor.id === b.lead_actor.id) {
    return {
      from_rank: fromRank, kind: "people", label_fa: "بازیگر مشترک",
      value: a.lead_actor.title, targets: [a.lead_actor],
    };
  }
  const bGenres = new Set((b.genres ?? []).map((g) => g.id));
  const shared = (a.genres ?? []).filter((g) => bGenres.has(g.id));
  if (shared.length) {
    // Most common across the list first (what the list is "about"), then by name.
    const freq = new Map<string, number>();
    for (const item of items) for (const g of item.genres ?? []) freq.set(g.id, (freq.get(g.id) ?? 0) + 1);
    const top = [...shared]
      .sort((x, y) => (freq.get(y.id) ?? 0) - (freq.get(x.id) ?? 0) || x.title.localeCompare(y.title))
      .slice(0, MAX_EDGE_GENRES);
    return {
      from_rank: fromRank, kind: "genre", label_fa: "ژانر مشترک",
      value: top.map((g) => g.title).join(" · "), targets: top,
    };
  }
  return { from_rank: fromRank, kind: "none", label_fa: null, value: null, targets: [] };
}

function people(item: GraphFields): EntityRef[] {
  return [item.director, item.lead_actor].filter((p): p is EntityRef => !!p);
}

/** Item at `index` reaching back to the earliest earlier, non-adjacent item that shares a person. */
export function backlinkFor(items: GraphFields[], index: number): ListBacklink | null {
  const mine = people(items[index]);
  for (let j = 0; j < index - 1; j++) {
    const theirs = new Set(people(items[j]).map((p) => p.id));
    const person = mine.find((p) => theirs.has(p.id));
    if (person) {
      return { rank: index + 1, target_position: j + 1, person_name: person.title, person_slug: person.slug };
    }
  }
  return null;
}

/** `detail` with `item` appended: the server's edges/backlinks kept, the new ones computed here. */
export function withAppendedItem(detail: ListDetail, item: ListItem): ListDetail {
  const items = [...detail.items, item];
  const index = items.length - 1;
  const edges = [...(detail.edges ?? [])];
  if (index > 0) edges.push(edgeBetween(items[index - 1], item, index, items));
  const backlinks = [...(detail.backlinks ?? [])];
  const backlink = backlinkFor(items, index);
  if (backlink) backlinks.push(backlink);
  return { ...detail, items, edges, backlinks };
}

/**
 * `detail` without one item. Pairs that stay adjacent keep the server's
 * edge; the new pair that closes the gap gets one computed here, and
 * backlinks drop the removed item and shift up past it.
 */
export function withoutItem(detail: ListDetail, itemId: string): ListDetail {
  const removed = detail.items.findIndex((i) => i.id === itemId);
  if (removed < 0) return detail;
  const items = detail.items.filter((_, i) => i !== removed);
  const old = detail.edges ?? [];
  const edges: ListEdge[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    const kept = i < removed - 1 ? old[i] : i >= removed ? old[i + 1] : undefined;
    edges.push(kept ? { ...kept, from_rank: i + 1 } : edgeBetween(items[i], items[i + 1], i + 1, items));
  }
  const removedRank = removed + 1;
  const shift = (rank: number) => (rank > removedRank ? rank - 1 : rank);
  const backlinks = (detail.backlinks ?? [])
    .filter((b) => b.rank !== removedRank && b.target_position !== removedRank)
    .map((b) => ({ ...b, rank: shift(b.rank), target_position: shift(b.target_position) }))
    // A link to what is now the item right before it is covered by the edge.
    .filter((b) => b.rank - b.target_position > 1);
  return { ...detail, items, edges, backlinks };
}

export type CandidateReason = { strength: 0 | 1 | 2; text: string; tone: string };

/**
 * How a candidate connects to the list: a shared director or lead actor
 * (violet, "متصل به #۴ و #۵ از طریق X"), else shared genres (teal), else
 * nothing (dim). strength sorts the results: people > genre > none.
 */
export function candidateReason(candidate: ListCandidate, items: ListItem[]): CandidateReason {
  const ranks: number[] = [];
  let via: EntityRef | null = null;
  items.forEach((item, i) => {
    const who =
      candidate.director && item.director?.id === candidate.director.id
        ? candidate.director
        : candidate.lead_actor && item.lead_actor?.id === candidate.lead_actor.id
          ? candidate.lead_actor
          : null;
    if (who) {
      ranks.push(i + 1);
      via = via ?? who;
    }
  });
  if (via) {
    const at = ranks.map((r) => `#${toFaDigits(r)}`).join(" و ");
    return { strength: 2, text: `متصل به ${at} از طریق ${(via as EntityRef).title}`, tone: "text-violet-light" };
  }
  const genreIds = new Set(candidate.genres.map((g) => g.id));
  const genreMatches = items.filter((item) => (item.genres ?? []).some((g) => genreIds.has(g.id))).length;
  if (genreMatches) {
    return { strength: 1, text: `ژانر مشترک با ${toFaDigits(genreMatches)} آیتم این لیست`, tone: "text-teal" };
  }
  return { strength: 0, text: "بدون اتصال مستقیم به این لیست", tone: "text-dim" };
}
