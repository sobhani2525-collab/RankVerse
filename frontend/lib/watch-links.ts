import type { WatchLink } from "@/lib/types";
import { toFaDigits } from "@/lib/format-number";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

/** The counted click-through: the API redirects to the streaming service. */
export function watchLinkHref(link: Pick<WatchLink, "id">): string {
  return `${API_BASE}/watch-links/${link.id}/go`;
}

export interface WatchCsvRow {
  entity_slug: string;
  provider: string;
  url: string;
  access_type: string;
  is_affiliate: boolean;
}

export interface WatchCsvResult {
  rows: WatchCsvRow[];
  /** Human-readable problems, one per skipped line (line numbers are 1-based, header included). */
  errors: string[];
}

/** Splits one CSV line, honouring double-quoted fields ("a,b" and "" as an escaped quote). */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

const TRUE_WORDS = new Set(["1", "true", "yes", "y", "بله", "آری"]);

/**
 * Parses `slug,provider,url[,access_type[,affiliate]]`. A header line (first
 * cell "slug" or "entity_slug") and blank lines are skipped. Invalid lines
 * are reported, not thrown, so one typo doesn't discard the whole file.
 */
export function parseWatchCsv(text: string): WatchCsvResult {
  const rows: WatchCsvRow[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const cells = splitCsvLine(line);
    const first = cells[0].toLowerCase();
    if (index === 0 && (first === "slug" || first === "entity_slug")) return;
    if (cells.length < 3 || !cells[0] || !cells[1] || !cells[2]) {
      errors.push(`خط ${toFaDigits(index + 1)}: دست‌کم slug، سرویس و لینک لازم است`);
      return;
    }
    rows.push({
      entity_slug: cells[0],
      provider: cells[1].toLowerCase(),
      url: cells[2],
      access_type: (cells[3] || "subscription").toLowerCase(),
      is_affiliate: TRUE_WORDS.has((cells[4] ?? "").toLowerCase()),
    });
  });
  return { rows, errors };
}
