import { genreLabel } from "@/lib/genre-labels";
import { toFaDigits } from "@/lib/format-number";

export type BattleThemeKind = "genre" | "decade" | "director" | "pair";

export interface BattleTheme {
  kind: BattleThemeKind;
  value: string;
  personalized?: boolean;
}

/** The line shown above a battle run ("همه هم‌ژانرند: درام"). */
export function reasonOf({ kind, value, personalized }: BattleTheme): string {
  if (kind === "pair") return "نبرد پیشنهادی برای تو";
  const base =
    kind === "genre"
      ? `همه هم‌ژانرند: ${genreLabel(value)}`
      : kind === "decade"
        ? `همه از دههٔ ${toFaDigits(value)} میلادی‌اند`
        : `همه ساختهٔ ${value}‌اند`;
  return personalized ? `بر پایهٔ سلیقهٔ تو · ${base}` : base;
}

/** Short subject for a result ("درام", "دههٔ ۱۹۹۰", "فیلم‌های نولان"); null for a pair. */
export function topicOf({ kind, value }: BattleTheme): string | null {
  if (kind === "genre") return genreLabel(value);
  if (kind === "decade") return `دههٔ ${toFaDigits(value)}`;
  if (kind === "director") return `فیلم‌های ${value}`;
  return null;
}

export const RESULT_KINDS = ["genre", "decade", "director", "pair"] as const;

/** /battles/result?... for a finished run; params are validated again on that page. */
export function resultPath(p: { slug: string; streak: number; count: number; theme: BattleTheme }): string {
  const qs = new URLSearchParams({
    c: p.slug,
    w: String(p.streak),
    n: String(p.count),
    k: p.theme.kind,
  });
  if (p.theme.kind !== "pair" && p.theme.value) qs.set("v", p.theme.value);
  return `/battles/result?${qs.toString()}`;
}
