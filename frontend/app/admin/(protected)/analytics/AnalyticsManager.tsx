"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ANALYTICS_RANGES, type AdminAnalytics, type AnalyticsDay, type AnalyticsRange, type AnalyticsTopTitle } from "@/lib/admin-analytics";
import { adminApiCall } from "@/lib/admin-users";
import { fullDate } from "@/lib/admin-format";
import { detailPathFor } from "@/lib/entity-routes";
import { toFaDigits } from "@/lib/format-number";
import { listHref } from "@/lib/list-url";
import { relativeTimeFa } from "@/lib/relative-time";
import { StatCard } from "../_components/StatCard";
import { TrendBars, tehranDayLabel } from "../_components/TrendBars";

const fa = (n: number) => toFaDigits(n.toLocaleString("en-US"));

const TREND_METRICS: { key: keyof Omit<AnalyticsDay, "date">; label: string; unit: string }[] = [
  { key: "active_users", label: "کاربران فعال", unit: "کاربر فعال" },
  { key: "signups", label: "ثبت‌نام", unit: "ثبت‌نام" },
  { key: "votes", label: "رأی‌ها", unit: "رأی" },
  { key: "ratings", label: "امتیازها", unit: "امتیاز" },
  { key: "comments", label: "نظرها", unit: "نظر" },
];

const VOTE_SOURCES: { key: keyof AdminAnalytics["votes_by_source"]; label: string }[] = [
  { key: "pool", label: "نبردهای کاربران" },
  { key: "pair", label: "کدام بهتر است؟ (دوتایی)" },
  { key: "daily", label: "نبرد روز" },
  { key: "bracket", label: "تورنمنت حذفی" },
];

// Page views and referrers live in the external script (components/Analytics.tsx), when one is configured.
const PAGE_ANALYTICS_URL = (() => {
  try {
    const src = process.env.NEXT_PUBLIC_ANALYTICS_SCRIPT;
    return src ? new URL(src).origin : null;
  } catch {
    return null;
  }
})();

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        {note && <span className="text-xs text-dim">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/** Labelled horizontal bars, each with its value written beside it. */
function HBars({ rows }: { rows: { label: string; value: number; hint?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-muted" title={r.label}>
            {r.label}
          </span>
          <span className="h-3 rounded-e-[4px] bg-teal/70" style={{ width: r.value ? `${Math.max(1.5, (r.value / max) * 100)}%` : 0 }} />
          <span className="num min-w-[4.5rem] text-start text-ink">
            {fa(r.value)}
            {total > 0 && <span className="ms-1.5 text-xs text-dim">{toFaDigits(Math.round((r.value / total) * 100))}٪</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Empty() {
  return <p className="py-6 text-center text-sm text-dim">در این بازه چیزی ثبت نشده.</p>;
}

function RankedTitles({ rows, valueLabel, showAvg }: { rows: AnalyticsTopTitle[]; valueLabel: string; showAvg?: boolean }) {
  if (rows.length === 0) return <Empty />;
  return (
    <ol className="divide-y divide-border-soft text-sm">
      {rows.map((t, i) => {
        const href = detailPathFor(t.entity_type, t.slug);
        return (
          <li key={t.id} className="flex items-center gap-3 py-2">
            <span className="num w-5 text-dim">{toFaDigits(i + 1)}</span>
            {href ? (
              <Link href={href} target="_blank" className="min-w-0 flex-1 truncate text-ink hover:text-teal">
                {t.title}
              </Link>
            ) : (
              <span className="min-w-0 flex-1 truncate text-ink">{t.title}</span>
            )}
            {showAvg && t.avg_score != null && (
              <span className="num text-xs text-gold" title="میانگین امتیاز">
                ★ {toFaDigits(t.avg_score.toFixed(1))}
              </span>
            )}
            <span className="num text-muted">
              {fa(t.count)} <span className="text-xs">{valueLabel}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function AnalyticsManager() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const param = Number(searchParams.get("days"));
  const days: AnalyticsRange = (ANALYTICS_RANGES as readonly number[]).includes(param) ? (param as AnalyticsRange) : 30;

  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [metric, setMetric] = useState<(typeof TREND_METRICS)[number]["key"]>("active_users");

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData((await adminApiCall<AdminAnalytics>("analytics", `?days=${days}`)).data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const setDays = (d: AnalyticsRange) => router.replace(d === 30 ? pathname : `${pathname}?days=${d}`, { scroll: false });

  // A stale range's numbers must not sit under the newly picked range's label.
  const d = data && data.days_count === days ? data : null;
  const k = d?.kpis;
  const prev = (key: keyof AdminAnalytics["kpis"]) => (k ? `دورهٔ قبل: ${fa(k[key].previous)}` : undefined);
  const trend = TREND_METRICS.find((m) => m.key === metric)!;
  const totalDaily = d ? d.daily_battle.member_votes + d.daily_battle.guest_votes : 0;

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="بازهٔ زمانی" className="flex gap-1 rounded-lg border border-border bg-surface p-1">
          {ANALYTICS_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={days === r}
              onClick={() => setDays(r)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${days === r ? "bg-gold/15 font-bold text-gold" : "text-muted hover:text-ink"}`}
            >
              {toFaDigits(r)} روز
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          {d ? (
            <>
              {tehranDayLabel(d.start)} تا امروز، در مقایسه با {toFaDigits(days)} روز قبل از آن · به‌روزرسانی{" "}
              <span title={fullDate(d.generated_at)}>{relativeTimeFa(d.generated_at)}</span>
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

      {error && !d ? (
        <p className="text-sm text-muted">
          خطا در دریافت آنالیتیکس.{" "}
          <button onClick={load} className="text-teal">
            تلاش مجدد
          </button>
        </p>
      ) : (
        <>
          <section aria-label="شاخص‌ها" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard label="کاربران فعال" value={k?.active_users.value ?? null} change={k?.active_users.change_pct} hint={prev("active_users")} />
            <StatCard label="ثبت‌نام" value={k?.signups.value ?? null} change={k?.signups.change_pct} hint={prev("signups")} />
            <StatCard label="رأی‌ها" value={k?.votes.value ?? null} change={k?.votes.change_pct} hint={prev("votes")} />
            <StatCard label="امتیازها" value={k?.ratings.value ?? null} change={k?.ratings.change_pct} hint={prev("ratings")} />
            <StatCard label="نظرها" value={k?.comments.value ?? null} change={k?.comments.change_pct} hint={prev("comments")} />
            <StatCard label="فهرست‌های جدید" value={k?.lists_created.value ?? null} change={k?.lists_created.change_pct} hint={prev("lists_created")} />
            <StatCard label="پسند فهرست‌ها" value={k?.list_likes.value ?? null} change={k?.list_likes.change_pct} hint={prev("list_likes")} />
            <StatCard label="دنبال‌کردن فهرست‌ها" value={k?.list_follows.value ?? null} change={k?.list_follows.change_pct} hint={prev("list_follows")} />
            <StatCard label="نبردهای جدید" value={k?.battles_created.value ?? null} change={k?.battles_created.change_pct} hint={prev("battles_created")} />
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="text-xs text-muted">فعال‌سازی کاربران جدید</div>
              {d ? (
                <>
                  <div className="num mt-1 text-2xl font-bold text-ink">
                    {d.activation.rate_pct == null ? "—" : `${toFaDigits(d.activation.rate_pct)}٪`}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface2">
                    <div className="h-full rounded-full bg-teal" style={{ width: `${d.activation.rate_pct ?? 0}%` }} />
                  </div>
                  <div className="mt-1.5 text-xs text-dim">
                    {fa(d.activation.activated)} از {fa(d.activation.signups)} ثبت‌نام دست‌کم یک کار کرده‌اند
                  </div>
                </>
              ) : (
                <div className="mt-2 h-7 w-16 animate-pulse rounded bg-surface2" />
              )}
            </div>
          </section>

          {d && (
            <>
              <section aria-label="روند روزانه" className="space-y-3">
                <div role="tablist" aria-label="شاخص نمودار" className="flex flex-wrap gap-2">
                  {TREND_METRICS.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      role="tab"
                      aria-selected={metric === m.key}
                      onClick={() => setMetric(m.key)}
                      className={`rounded-full border px-4 py-1.5 text-sm transition ${
                        metric === m.key ? "border-gold/50 bg-gold/15 font-bold text-gold" : "border-border text-muted hover:border-gold/30 hover:text-ink"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <TrendBars
                  title={`${trend.label} در روز`}
                  unit={trend.unit}
                  days={d.days}
                  pick={(x) => x[trend.key]}
                  totalLabel={trend.key === "active_users" ? undefined : `مجموع ${toFaDigits(days)} روز`}
                  height="h-44"
                />
                {trend.key === "active_users" && (
                  <p className="text-xs text-dim">
                    کاربر فعال یعنی کسی که در آن روز رأی داده، امتیاز یا نظر داده، یا فهرستی ساخته، پسندیده یا دنبال کرده. ورود به سایت به‌تنهایی حساب نمی‌شود.
                  </p>
                )}
              </section>

              <div className="grid gap-3 lg:grid-cols-2">
                <Panel title="رأی‌ها به تفکیک بخش">
                  <HBars rows={VOTE_SOURCES.map((s) => ({ label: s.label, value: d.votes_by_source[s.key] }))} />
                  {totalDaily > 0 && (
                    <p className="mt-3 text-xs text-dim">
                      نبرد روز: {fa(d.daily_battle.member_votes)} رأی از کاربران و {fa(d.daily_battle.guest_votes)} رأی از مهمان‌ها
                    </p>
                  )}
                </Panel>
                <Panel title="توزیع امتیازهای جدید">
                  <HBars rows={[...d.rating_distribution].reverse().map((r) => ({ label: `${toFaDigits(r.score)} ستاره`, value: r.count }))} />
                </Panel>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <Panel title="پرانتخاب‌ترین عنوان‌ها" note="برندهٔ رأی در همهٔ نبردها">
                  <RankedTitles rows={d.top_chosen_titles} valueLabel="انتخاب" />
                </Panel>
                <Panel title="پرامتیازترین عنوان‌ها" note="بیشترین امتیاز جدید">
                  <RankedTitles rows={d.top_rated_titles} valueLabel="امتیاز" showAvg />
                </Panel>
                <Panel title="فهرست‌های محبوب" note="پسند و دنبال‌کردن در این بازه">
                  {d.top_lists.length === 0 ? (
                    <Empty />
                  ) : (
                    <ol className="divide-y divide-border-soft text-sm">
                      {d.top_lists.map((l, i) => (
                        <li key={l.id} className="flex items-center gap-3 py-2">
                          <span className="num w-5 text-dim">{toFaDigits(i + 1)}</span>
                          <span className="min-w-0 flex-1 truncate">
                            <Link href={listHref(l.slug)} target="_blank" className="text-ink hover:text-teal">
                              {l.title}
                            </Link>
                            <span className="ms-2 text-xs text-dim" dir="ltr">
                              @{l.owner_username}
                            </span>
                          </span>
                          <span className="num text-xs text-muted">
                            {fa(l.likes)} پسند · {fa(l.follows)} دنبال‌کننده
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Panel>
                <Panel title="نبردهای پرطرفدار" note="انتخاب‌ها در این بازه">
                  {d.top_battles.length === 0 ? (
                    <Empty />
                  ) : (
                    <ol className="divide-y divide-border-soft text-sm">
                      {d.top_battles.map((b, i) => (
                        <li key={b.id} className="flex items-center gap-3 py-2">
                          <span className="num w-5 text-dim">{toFaDigits(i + 1)}</span>
                          <Link href={`/battles/${b.slug}`} target="_blank" className="min-w-0 flex-1 truncate text-ink hover:text-teal">
                            {b.title}
                          </Link>
                          <span className="num text-xs text-muted">
                            {fa(b.picks)} انتخاب · {fa(b.players)} بازیکن
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Panel>
              </div>

              <Panel title="کلیک لینک‌های تماشا" note="از ابتدا تا امروز (کلیک‌ها تاریخ ندارند)">
                {d.watch_providers.length === 0 ? (
                  <Empty />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-dim">
                        <th className="pb-2 text-start font-normal">سرویس</th>
                        <th className="pb-2 text-start font-normal">لینک‌ها</th>
                        <th className="pb-2 text-start font-normal">کلیک‌ها</th>
                        <th className="pb-2 text-start font-normal">کلیک به ازای هر لینک</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-soft">
                      {d.watch_providers.map((p) => (
                        <tr key={p.provider}>
                          <td className="py-2 text-ink">{p.name}</td>
                          <td className="py-2 text-muted">
                            <span className="num">{fa(p.links)}</span>
                          </td>
                          <td className="py-2 text-ink">
                            <span className="num">{fa(p.clicks)}</span>
                          </td>
                          <td className="py-2 text-muted">
                            <span className="num">{toFaDigits((p.clicks / Math.max(1, p.links)).toFixed(1))}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <Link href="/admin/watch-links" className="mt-3 inline-block text-xs text-teal">
                  مدیریت لینک‌ها
                </Link>
              </Panel>

              <p className="text-xs text-dim">
                بازدید صفحه‌ها و منبع ورود کاربران اینجا ثبت نمی‌شود؛ آن‌ها در اسکریپت آنالیتیکس سایت (Umami یا Plausible) هستند.
                {PAGE_ANALYTICS_URL ? (
                  <>
                    {" "}
                    <a href={PAGE_ANALYTICS_URL} target="_blank" rel="noreferrer" className="text-teal">
                      باز کردن پنل آنالیتیکس
                    </a>
                  </>
                ) : (
                  " این اسکریپت هنوز روی سایت تنظیم نشده."
                )}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
