"use client";
import { useCallback, useEffect, useState } from "react";
import { toFaDigits } from "@/lib/format-number";
import { formatJalaliDate } from "@/lib/daily-battle";
import { displayTitle } from "@/lib/title";
import { searchEntities, SearchResult } from "@/lib/api";
import { reasonOf } from "@/lib/battle-theme";

interface Film {
  id: string;
  title: string;
  title_fa: string | null;
  year: number | null;
}

interface Row {
  id: string;
  battle_date: string;
  left: Film;
  right: Film;
  theme_kind: "genre" | "decade" | "director" | "pair";
  theme_value: string;
  source: "auto" | "admin";
  left_votes: number;
  right_votes: number;
  total: number;
  left_percent: number | null;
  right_percent: number | null;
  editable: boolean;
  deletable: boolean;
}

interface Envelope<T> {
  data: T;
  meta?: { total?: number } | null;
  error?: { message: string } | null;
}

async function call<T>(path: string, init?: RequestInit): Promise<Envelope<T>> {
  const res = await fetch(`/api/admin/daily-battles${path}`, {
    ...init,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json || json.error) {
    // FastAPI's own 422 body has `detail`, not our envelope.
    const detail = (json as unknown as { detail?: unknown } | null)?.detail;
    throw new Error(json?.error?.message || (typeof detail === "string" ? detail : "ورودی نامعتبر است") || `خطا (${res.status})`);
  }
  return json;
}

const field = "rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink focus:border-gold/50 focus:outline-none";

/** Today's date in Tehran as YYYY-MM-DD. */
function tehranToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
}

function tehranTomorrow(): string {
  const d = new Date(`${tehranToday()}T12:00:00+03:30`);
  d.setDate(d.getDate() + 1);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(d);
}

function filmName(f: Film): string {
  return displayTitle(f) + (f.year ? ` · ${toFaDigits(f.year)}` : "");
}

export function AdminDailyBattlesManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [today, setToday] = useState("");

  const [date, setDate] = useState("");
  const [left, setLeft] = useState<SearchResult | null>(null);
  const [right, setRight] = useState<SearchResult | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setToday(tehranToday());
    setDate(tehranTomorrow());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await call<Row[]>("?page_size=100")).data);
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "خطا در دریافت نبردها" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function schedule(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !left || !right) {
      setNotice({ ok: false, text: "تاریخ و هر دو فیلم را انتخاب کن." });
      return;
    }
    if (left.id === right.id) {
      setNotice({ ok: false, text: "دو فیلم باید متفاوت باشند." });
      return;
    }
    setSaving(true);
    try {
      await call("", { method: "POST", body: JSON.stringify({ battle_date: date, left_id: left.id, right_id: right.id }) });
      setNotice({ ok: true, text: "نبرد برنامه‌ریزی شد." });
      setLeft(null);
      setRight(null);
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "ذخیره نشد" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Row) {
    if (!window.confirm(`نبرد ${formatJalaliDate(row.battle_date)} حذف شود؟ آن روز دوباره خودکار انتخاب می‌شود.`)) return;
    setBusyId(row.id);
    try {
      await call(`/${row.id}`, { method: "DELETE" });
      setNotice({ ok: true, text: "نبرد حذف شد؛ آن روز به انتخاب خودکار برمی‌گردد." });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "حذف نشد" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-6 space-y-8">
      {notice && (
        <p role="status" className={`rounded-lg border px-4 py-2 text-sm ${notice.ok ? "border-teal/40 bg-teal/10 text-teal" : "border-rose-500/30 bg-rose-500/10 text-rose-400"}`}>
          {notice.text}
        </p>
      )}

      <form onSubmit={schedule} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-base font-bold text-ink">برنامه‌ریزی نبرد</h2>
        <label className="flex flex-col gap-1 text-xs text-muted">
          تاریخ (میلادی، به وقت تهران)
          <input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className={`${field} w-48`} required />
          {date && <span className="text-ink-dim">{formatJalaliDate(date)}</span>}
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <MoviePicker label="فیلم اول (سمت راست)" value={left} onChange={setLeft} />
          <MoviePicker label="فیلم دوم (سمت چپ)" value={right} onChange={setRight} />
        </div>
        <button type="submit" disabled={saving} className="btn-primary text-sm disabled:opacity-50">
          {saving ? "در حال ذخیره…" : "ثبت نبرد"}
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[720px] text-right text-sm">
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th className="px-4 py-3">تاریخ</th>
              <th className="px-4 py-3">فیلم‌ها</th>
              <th className="px-4 py-3">موضوع</th>
              <th className="px-4 py-3">منبع</th>
              <th className="px-4 py-3">رأی‌ها</th>
              <th className="px-4 py-3">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted">در حال بارگذاری…</td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted">در بازهٔ ۱۴ روز گذشته و آینده نبردی نیست.</td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/60 align-top last:border-0">
                <td className="px-4 py-3 text-ink">
                  {formatJalaliDate(row.battle_date)}
                  {row.battle_date === today && <span className="mr-2 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] text-gold">امروز</span>}
                </td>
                <td className="px-4 py-3 text-ink">
                  <div>{filmName(row.left)}</div>
                  <div className="text-muted">{filmName(row.right)}</div>
                </td>
                <td className="px-4 py-3 text-xs text-muted">{row.theme_kind === "pair" ? "—" : reasonOf({ kind: row.theme_kind, value: row.theme_value })}</td>
                <td className="px-4 py-3 text-xs">{row.source === "admin" ? "دستی" : "خودکار"}</td>
                <td className="num px-4 py-3 text-xs text-ink-dim">
                  {row.total === 0 ? (
                    "—"
                  ) : (
                    <>
                      {toFaDigits(row.left_votes)} ({toFaDigits(row.left_percent ?? 0)}٪) – {toFaDigits(row.right_votes)} ({toFaDigits(row.right_percent ?? 0)}٪)
                    </>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {row.deletable ? (
                    <button type="button" disabled={busyId === row.id} onClick={() => remove(row)} className="text-rose-400 underline disabled:opacity-50">
                      بازگشت به انتخاب خودکار
                    </button>
                  ) : row.total > 0 ? (
                    <span className="text-muted">رأی دارد؛ قابل ویرایش یا حذف نیست</span>
                  ) : (
                    <span className="text-muted">{row.editable ? "امروز؛ فعال است" : "گذشته"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Search-as-you-type over the public movie search. */
function MoviePicker({ label, value, onChange }: { label: string; value: SearchResult | null; onChange: (r: SearchResult | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      searchEntities(q, "movie")
        .then((r) => !cancelled && setResults(r.slice(0, 8)))
        .catch(() => !cancelled && setResults([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {value ? (
        <div className="flex items-center justify-between rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-ink">
          <span>{displayTitle(value)}</span>
          <button type="button" onClick={() => onChange(null)} className="text-xs text-muted underline">
            تغییر
          </button>
        </div>
      ) : (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی فیلم…" className={field} />
          {results.length > 0 && (
            <ul className="max-h-56 overflow-y-auto rounded-lg border border-border bg-bg">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(r);
                      setQ("");
                      setResults([]);
                    }}
                    className="block w-full px-3 py-2 text-right text-sm text-ink hover:bg-surface2"
                  >
                    {displayTitle(r)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
