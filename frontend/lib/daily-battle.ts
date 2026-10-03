import { toFaDigits } from "@/lib/format-number";
import type { DailyResults, DailySide } from "@/lib/types";

const GUEST_ID_KEY = "rankverse_guest_id";

/**
 * The UUID that tells a guest apart for the daily battle. Kept in localStorage;
 * every access is guarded because storage can be blocked (private mode,
 * cleared site data) -- then a per-page-load id is used so voting still works.
 */
let memoryGuestId: string | null = null;

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getGuestId(): string {
  try {
    const stored = localStorage.getItem(GUEST_ID_KEY);
    if (stored && /^[0-9a-f-]{36}$/i.test(stored)) return stored;
    const id = newId();
    localStorage.setItem(GUEST_ID_KEY, id);
    return id;
  } catch {
    memoryGuestId ??= newId();
    return memoryGuestId;
  }
}

/** Whole-number shares that always add up to 100 (the right side takes the remainder). */
export function percents(results: DailyResults): { left: number; right: number } {
  if (results.total <= 0) return { left: 0, right: 0 };
  const left = Math.round((results.left_votes * 100) / results.total);
  return { left, right: 100 - left };
}

/** How many percent of voters picked the same side as `side`. */
export function sharePercent(results: DailyResults, side: DailySide): number {
  const p = percents(results);
  return side === "left" ? p.left : p.right;
}

/** "۰۵:۱۲:۴۰" */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  return toFaDigits(`${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`);
}

/** "شنبه ۱۱ مهر ۱۴۰۵" for a YYYY-MM-DD Tehran date. */
export function formatJalaliDate(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Tehran",
    }).format(new Date(`${isoDate}T12:00:00+03:30`));
  } catch {
    return toFaDigits(isoDate);
  }
}
