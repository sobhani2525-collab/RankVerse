"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  parseTmdbInput,
  type AdminIngestionOverview,
  type IngestionSyncResult,
  type IngestionTitle,
  type SyncEntityType,
  type TmdbCheck,
} from "@/lib/admin-ingestion";
import { adminApiCall } from "@/lib/admin-users";
import { fullDate } from "@/lib/admin-format";
import { detailPathFor } from "@/lib/entity-routes";
import { toFaDigits } from "@/lib/format-number";
import { relativeTimeFa } from "@/lib/relative-time";

const fa = (n: number) => toFaDigits(n.toLocaleString("en-US"));
const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
const call = <T,>(path: string, init?: RequestInit) => adminApiCall<T>("ingestion", path, init);

const TYPE_LABEL: Record<string, string> = { movie: "فیلم‌ها", tv_series: "سریال‌ها", person: "افراد", genre: "ژانرها" };
const SOURCE_LABEL: Record<string, string> = {
  tmdb: "TMDb",
  tmdb_person: "TMDb",
  tmdb_genre: "TMDb",
  tv_genre: "TMDb",
  none: "دستی/بدون منبع",
};
const OVERVIEW_SOURCES: { key: string; label: string }[] = [
  { key: "tmdb_fa", label: "فارسی از TMDb" },
  { key: "manual", label: "دستی (ادمین)" },
  { key: "machine", label: "ترجمهٔ ماشینی" },
  { key: "en", label: "فقط انگلیسی" },
  { key: "none", label: "بدون خلاصه" },
];
const BIO_SOURCES: { key: string; label: string }[] = [
  { key: "tmdb_fa", label: "فارسی از TMDb" },
  { key: "machine", label: "ترجمهٔ ماشینی" },
  { key: "en", label: "فقط انگلیسی" },
  { key: "none", label: "بدون زندگی‌نامه" },
];

// The jobs that stay command-line scripts: they run for minutes to hours.
const SCRIPTS: { cmd: string; what: string }[] = [
  { cmd: "import_tmdb_catalog.py [--kind movie|tv|all] [--min-votes 100]", what: "وارد کردن کاتالوگ خارجی TMDb بالای حداقل رأی؛ با ‎--existing‎ عنوان‌های موجود دوباره sync می‌شوند." },
  { cmd: "sync_iranian_titles.py", what: "فیلم‌ها و سریال‌های ایرانی و فارسی‌زبان از TMDb." },
  { cmd: "sync_imdb_ratings.py", what: "امتیاز و تعداد رأی IMDb از فایل روزانهٔ IMDb؛ هر وقت لازم بود، مثلاً روزانه." },
  { cmd: "translation_stats.py", what: "چند خلاصه و زندگی‌نامه هنوز ترجمه نشده (فقط خواندنی)." },
  { cmd: "translate_overviews.py [--limit N]", what: "ترجمهٔ ماشینی خلاصه‌های انگلیسی به فارسی (Message Batch)." },
  { cmd: "translate_biographies.py", what: "ترجمهٔ ماشینی زندگی‌نامه‌ها؛ نسخهٔ _direct برای gateway بدون Batch." },
  { cmd: "backfill_person_profiles.py", what: "عکس و زندگی‌نامهٔ افراد از TMDb." },
  { cmd: "backfill_media_extras.py", what: "تریلر و بازیگران بیشتر برای عنوان‌های قدیمی." },
  { cmd: "recompute_rankings.py", what: "محاسبهٔ دوبارهٔ امتیاز ترکیبی همهٔ عنوان‌ها." },
  { cmd: "refresh_person_stats.py", what: "بازسازی جدول رتبه‌بندی افراد بعد از sync." },
];

function Panel({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        {note && <span className="text-xs text-dim">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${ok ? "text-teal" : "text-gold"}`}>
      <span aria-hidden>{ok ? "✓" : "!"}</span>
      {label}
    </span>
  );
}

/** Counts that add up to a whole, one row each with its share. */
function Breakdown({ rows, counts }: { rows: { key: string; label: string }[]; counts: Record<string, number> }) {
  const total = rows.reduce((a, r) => a + (counts[r.key] ?? 0), 0);
  return (
    <ul className="space-y-1.5 text-sm">
      {rows.map((r) => {
        const n = counts[r.key] ?? 0;
        return (
          <li key={r.key} className="grid grid-cols-[8.5rem_1fr_auto] items-center gap-3">
            <span className="text-muted">{r.label}</span>
            <span className="h-2 rounded-e-[4px] bg-teal/60" style={{ width: n ? `${Math.max(1.5, pct(n, total))}%` : 0 }} />
            <span className="min-w-[5.5rem] text-start text-xs text-dim">
              <b className="num text-ink">{fa(n)}</b> <span className="num">{toFaDigits(pct(n, total))}٪</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TitleRows({
  rows,
  dateOf,
  busyKey,
  onSync,
}: {
  rows: IngestionTitle[];
  dateOf: (t: IngestionTitle) => string;
  busyKey: string | null;
  onSync: (type: SyncEntityType, id: number) => void;
}) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-dim">چیزی برای نمایش نیست.</p>;
  return (
    <ul className="divide-y divide-border-soft text-sm">
      {rows.map((t) => {
        const href = detailPathFor(t.entity_type, t.slug);
        const key = t.tmdb_id ? `${t.entity_type}:${t.tmdb_id}` : null;
        return (
          <li key={t.id} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1 truncate">
              {href ? (
                <Link href={href} target="_blank" className="text-ink hover:text-teal">
                  {t.title_fa || t.title}
                </Link>
              ) : (
                <span className="text-ink">{t.title_fa || t.title}</span>
              )}
              <span className="ms-2 text-xs text-dim">{t.entity_type === "tv_series" ? "سریال" : "فیلم"}</span>
            </span>
            <span className="text-xs text-dim" title={fullDate(dateOf(t))}>
              {relativeTimeFa(dateOf(t))}
            </span>
            {t.tmdb_id && (
              <button
                type="button"
                disabled={busyKey != null}
                onClick={() => onSync(t.entity_type, Number(t.tmdb_id))}
                className="rounded-md border border-border px-2 py-1 text-xs text-muted transition hover:border-gold/40 hover:text-ink disabled:opacity-50"
              >
                {busyKey === key ? "در حال sync…" : "به‌روزرسانی"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function IngestionManager() {
  const [data, setData] = useState<AdminIngestionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [check, setCheck] = useState<TmdbCheck | null>(null);
  const [checking, setChecking] = useState(false);

  const [kind, setKind] = useState<SyncEntityType>("movie");
  const [input, setInput] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string; result?: IngestionSyncResult } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData((await call<AdminIngestionOverview>("/overview")).data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runCheck() {
    setChecking(true);
    try {
      setCheck((await call<TmdbCheck>("/tmdb-check")).data);
    } catch (err) {
      setCheck({ ok: false, status: null, ms: 0, message: err instanceof Error ? err.message : "خطا در بررسی اتصال" });
    } finally {
      setChecking(false);
    }
  }

  async function sync(type: SyncEntityType, tmdbId: number) {
    setBusyKey(`${type}:${tmdbId}`);
    setNotice(null);
    try {
      const { data: result } = await call<IngestionSyncResult>("/sync", {
        method: "POST",
        body: JSON.stringify({ entity_type: type, tmdb_id: tmdbId }),
      });
      setNotice({ ok: true, text: result.created ? "عنوان تازه اضافه شد:" : "عنوان به‌روز شد:", result });
      await load();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : "خطا در همگام‌سازی" });
    } finally {
      setBusyKey(null);
    }
  }

  const parsed = parseTmdbInput(input);
  // A pasted TMDb link says itself whether it is a movie or a series.
  const effectiveKind = parsed?.type ?? kind;

  const d = data;
  const movieCov = d?.coverage.find((c) => c.entity_type === "movie");
  const imdbRated = d ? d.coverage.reduce((a, c) => a + c.with_imdb_rating, 0) : 0;
  const titlesTotal = d ? d.coverage.reduce((a, c) => a + c.total, 0) : 0;
  const machineOverviews = d ? d.coverage.reduce((a, c) => a + (c.overview_sources.machine ?? 0), 0) : 0;
  const resultHref = notice?.result ? detailPathFor(notice.result.entity_type, notice.result.slug) : null;

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted">
          {d ? (
            <>
              به‌روزرسانی <span title={fullDate(d.generated_at)}>{relativeTimeFa(d.generated_at)}</span>
            </>
          ) : error ? null : (
            "در حال بارگذاری…"
          )}
        </p>
        <button
          onClick={load}
          disabled={loading}
          className="ms-auto rounded-lg border border-border px-3 py-2 text-sm text-ink transition hover:border-gold/50 disabled:opacity-50"
        >
          {loading ? "در حال دریافت…" : "تازه‌سازی"}
        </button>
      </div>

      {error && !d && (
        <p className="text-sm text-muted">
          خطا در دریافت وضعیت داده‌ها.{" "}
          <button onClick={load} className="text-teal">
            تلاش مجدد
          </button>
        </p>
      )}

      {d && d.sync_alerts.open > 0 && (
        <Link
          href="/admin/alerts"
          className="flex flex-wrap items-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold transition hover:border-gold/60"
        >
          <span aria-hidden className="font-bold">
            !
          </span>
          <b className="num">{fa(d.sync_alerts.open)}</b> هشدار باز همگام‌سازی
          {d.sync_alerts.last_title && <span className="text-ink">— {d.sync_alerts.last_title}</span>}
          {d.sync_alerts.last_seen_at && <span className="text-xs text-muted">({relativeTimeFa(d.sync_alerts.last_seen_at)})</span>}
        </Link>
      )}

      {d && (
        <section aria-label="منابع داده" className="grid gap-3 lg:grid-cols-3">
          <Panel title="TMDb" note="فیلم، سریال، افراد، ژانر">
            <StatusDot ok={d.sources.tmdb_configured} label={d.sources.tmdb_configured ? "کلید API تنظیم شده" : "کلید API تنظیم نشده"} />
            <p className="mt-2 truncate text-xs text-dim" dir="ltr">
              {d.sources.tmdb_base_url}
            </p>
            <button
              type="button"
              onClick={runCheck}
              disabled={checking}
              className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs text-ink transition hover:border-gold/50 disabled:opacity-50"
            >
              {checking ? "در حال بررسی…" : "بررسی اتصال از سرور"}
            </button>
            {check && (
              <p className={`mt-2 text-xs ${check.ok ? "text-teal" : "text-red-300"}`}>
                {check.message}
                {check.ms > 0 && <span className="num ms-1 text-dim">({toFaDigits(check.ms)} میلی‌ثانیه)</span>}
              </p>
            )}
          </Panel>
          <Panel title="IMDb" note="فایل روزانهٔ title.ratings">
            <div className="num text-2xl font-bold text-ink">{toFaDigits(pct(imdbRated, titlesTotal))}٪</div>
            <p className="mt-1 text-xs text-muted">
              فیلم‌ها و سریال‌هایی که امتیاز IMDb دارند (<span className="num">{fa(imdbRated)}</span> از{" "}
              <span className="num">{fa(titlesTotal)}</span>)
            </p>
            {movieCov && (
              <p className="mt-1 text-xs text-dim">
                <span className="num">{fa(movieCov.total - movieCov.with_imdb_id)}</span> فیلم شناسهٔ IMDb ندارند و امتیاز نمی‌گیرند.
              </p>
            )}
            <p className="mt-2 text-xs text-dim" dir="ltr">
              scripts/sync_imdb_ratings.py
            </p>
          </Panel>
          <Panel title="ترجمهٔ ماشینی" note="خلاصه‌ها و زندگی‌نامه‌ها">
            <StatusDot ok={d.sources.translation_configured} label={d.sources.translation_configured ? "کلید Anthropic تنظیم شده" : "کلید Anthropic روی این سرور نیست"} />
            <p className="mt-2 text-xs text-muted">
              مدل: <span dir="ltr">{d.sources.translation_model}</span> · <span className="num">{fa(machineOverviews)}</span> خلاصهٔ ترجمه‌شده
            </p>
            <p className="mt-2 text-xs text-dim">اسکریپت‌های ترجمه معمولاً از دستگاه خودتان اجرا می‌شوند، پس نبودن کلید روی سرور اشکالی ندارد.</p>
          </Panel>
        </section>
      )}

      <Panel title="همگام‌سازی یک عنوان از TMDb" note="عنوان تازه اضافه می‌شود؛ عنوان موجود به‌روز می‌شود (خلاصهٔ دستی دست نمی‌خورد)">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed) void sync(effectiveKind, parsed.id);
          }}
        >
          <select
            value={effectiveKind}
            disabled={parsed?.type != null}
            onChange={(e) => setKind(e.target.value as SyncEntityType)}
            aria-label="نوع"
            className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink disabled:opacity-70"
          >
            <option value="movie">فیلم</option>
            <option value="tv_series">سریال</option>
          </select>
          <input
            dir="ltr"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="550 / https://www.themoviedb.org/movie/550"
            aria-label="شناسه یا لینک TMDb"
            className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-gold/50"
          />
          <button
            type="submit"
            disabled={!parsed || busyKey != null}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-bg transition hover:brightness-110 disabled:opacity-50"
          >
            {busyKey != null && parsed && busyKey === `${effectiveKind}:${parsed.id}` ? "در حال sync…" : "همگام‌سازی"}
          </button>
        </form>
        {input.trim() && !parsed && <p className="mt-2 text-xs text-gold">شناسهٔ عددی یا لینک صفحهٔ فیلم/سریال در TMDb را وارد کنید.</p>}
        {notice && (
          <p className={`mt-3 text-sm ${notice.ok ? "text-teal" : "text-red-300"}`} role="status">
            {notice.text}{" "}
            {notice.result &&
              (resultHref ? (
                <Link href={resultHref} target="_blank" className="font-bold text-ink hover:text-teal">
                  {notice.result.title}
                </Link>
              ) : (
                <b className="text-ink">{notice.result.title}</b>
              ))}
          </p>
        )}
      </Panel>

      {d && (
        <>
          <Panel title="کاتالوگ و تازگی داده‌ها" note="«تغییر» شامل sync دوباره، امتیاز IMDb، ترجمه و ویرایش ادمین است">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-dim">
                    {["نوع", "کل", "اضافه‌شده ۷ روز", "اضافه‌شده ۳۰ روز", "تغییر ۷ روز", "بدون تغییر ۱۸۰ روز", "آخرین افزودن", "منبع"].map((h) => (
                      <th key={h} className="whitespace-nowrap pb-2 pe-4 text-start font-normal">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {d.types.map((t) => (
                    <tr key={t.entity_type}>
                      <td className="py-2 pe-4 text-ink">{TYPE_LABEL[t.entity_type] ?? t.entity_type}</td>
                      {[t.total, t.added_7d, t.added_30d, t.changed_7d, t.unchanged_180d].map((n, i) => (
                        <td key={i} className={`py-2 pe-4 ${i === 0 ? "text-ink" : "text-muted"}`}>
                          <span className="num">{fa(n)}</span>
                        </td>
                      ))}
                      <td className="whitespace-nowrap py-2 pe-4 text-xs text-muted" title={t.last_added_at ? fullDate(t.last_added_at) : undefined}>
                        {t.last_added_at ? relativeTimeFa(t.last_added_at) : "—"}
                      </td>
                      <td className="py-2 text-xs text-dim">
                        {Object.entries(t.sources)
                          .sort((a, b) => b[1] - a[1])
                          .map(([s, n]) => `${SOURCE_LABEL[s] ?? s}: ${fa(n)}`)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-3 lg:grid-cols-3">
            {d.coverage.map((c) => (
              <Panel key={c.entity_type} title={`خلاصهٔ ${c.entity_type === "tv_series" ? "سریال‌ها" : "فیلم‌ها"}`} note={<Link href="/admin/entities" className="text-teal">ویرایش خلاصه‌ها</Link>}>
                <Breakdown rows={OVERVIEW_SOURCES} counts={c.overview_sources} />
              </Panel>
            ))}
            <Panel title="زندگی‌نامهٔ افراد">
              <Breakdown rows={BIO_SOURCES} counts={d.biography_sources} />
            </Panel>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="تازه‌ترین عنوان‌ها" note="آخرین فیلم‌ها و سریال‌های اضافه‌شده">
              <TitleRows rows={d.recent} dateOf={(t) => t.created_at} busyKey={busyKey} onSync={sync} />
            </Panel>
            <Panel title="قدیمی‌ترین داده‌ها" note="عنوان‌های پرطرفدار (۱۰۰۰+ رأی TMDb) که مدت‌ها تغییر نکرده‌اند">
              <TitleRows rows={d.stale} dateOf={(t) => t.updated_at} busyKey={busyKey} onSync={sync} />
            </Panel>
          </div>

          <Panel title="تاریخچهٔ همگام‌سازی از پنل" note={<Link href="/admin/audit-log" className="text-teal">تاریخچهٔ کامل مدیریتی</Link>}>
            {d.runs.length === 0 ? (
              <p className="py-6 text-center text-sm text-dim">هنوز از این پنل همگام‌سازی‌ای انجام نشده.</p>
            ) : (
              <ul className="divide-y divide-border-soft text-sm">
                {d.runs.map((r, i) => {
                  const a = r.after ?? {};
                  return (
                    <li key={`${r.created_at}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <span className="text-xs text-dim" title={fullDate(r.created_at)}>
                        {relativeTimeFa(r.created_at)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-ink">{String(a.title ?? r.target_id)}</span>
                      <span className="text-xs text-muted">
                        {a.entity_type === "tv_series" ? "سریال" : "فیلم"} · TMDb <span className="num">{String(a.tmdb_id ?? "")}</span>
                      </span>
                      <span className={`rounded-md px-2 py-0.5 text-xs ${a.created ? "bg-teal/10 text-teal" : "bg-surface2 text-muted"}`}>
                        {a.created ? "اضافه شد" : "به‌روز شد"}
                      </span>
                      <span className="text-xs text-dim" dir="ltr">
                        {r.admin_email}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </>
      )}

      <Panel title="کارهای حجیم (اسکریپت‌ها)" note="چند دقیقه تا چند ساعت طول می‌کشند، پس از خط فرمان اجرا می‌شوند، نه از این پنل">
        <ul className="divide-y divide-border-soft text-sm">
          {SCRIPTS.map((s) => (
            <li key={s.cmd} className="grid gap-1 py-2 md:grid-cols-[minmax(0,22rem)_1fr] md:gap-4">
              <code className="truncate text-xs text-ink-dim" dir="ltr" title={`python scripts/${s.cmd}`}>
                python scripts/{s.cmd}
              </code>
              <span className="text-muted">{s.what}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
