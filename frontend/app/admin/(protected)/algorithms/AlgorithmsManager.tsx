"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  PARAM_INFO,
  SIMULATED_PARAMS,
  simulateScore,
  type AlgorithmParam,
  type AlgorithmsHealth,
  type DriftReport,
  type RankingParams,
  type ScoreExplanation,
  type TitleRef,
} from "@/lib/admin-algorithms";
import { adminApiCall } from "@/lib/admin-users";
import { fullDate } from "@/lib/admin-format";
import { detailPathFor } from "@/lib/entity-routes";
import { toFaDigits } from "@/lib/format-number";
import { relativeTimeFa } from "@/lib/relative-time";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { StatCard } from "../_components/StatCard";

const fa = (n: number) => toFaDigits(n.toLocaleString("en-US"));
const num = (n: number | null | undefined, digits = 2) => (n == null ? "—" : toFaDigits(n.toFixed(digits)));
const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);
const call = <T,>(path: string, init?: RequestInit) => adminApiCall<T>("algorithms", path, init);

const GROUPS: { key: AlgorithmParam["group"]; title: string; note: string }[] = [
  { key: "ranking", title: "امتیاز و رتبه‌بندی", note: "app/modules/ranking/service.py" },
  { key: "elo", title: "Elo نبردها", note: "ثابت‌های کد در battles/elo.py" },
  { key: "taste", title: "Taste DNA و پیشنهادها", note: "app/modules/taste" },
  { key: "lists", title: "فهرست‌ها", note: "امتیاز آیتم‌های جمعی و کشف" },
  { key: "daily_battle", title: "نبرد روز", note: "انتخاب خودکار زوج" },
];
const TYPE_LABEL: Record<string, string> = { movie: "فیلم‌ها", tv_series: "سریال‌ها" };
const SOURCE_LABEL: Record<string, string> = { imdb: "IMDb", tmdb: "TMDb", prior: "بدون امتیاز بیرونی" };

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

/** computed_score in one-point buckets (0-1 .. 9-10). */
function Histogram({ buckets, title }: { buckets: number[]; title: string }) {
  const max = Math.max(1, ...buckets);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <figure>
      <figcaption className="mb-2 text-xs text-muted">{title}</figcaption>
      <div dir="ltr" className="relative">
        <div className="flex h-24 items-end gap-[2px] border-b border-border" onMouseLeave={() => setHover(null)}>
          {buckets.map((n, i) => (
            <div key={i} className="flex h-full flex-1 items-end justify-center" onMouseEnter={() => setHover(i)} onMouseOver={() => setHover(i)}>
              <div
                className={`w-full max-w-[24px] rounded-t-[4px] ${hover === i ? "bg-teal" : "bg-teal/60"}`}
                style={{ height: n ? `${Math.max(3, (n / max) * 100)}%` : 0 }}
              />
            </div>
          ))}
        </div>
        {hover != null && (
          <div
            dir="rtl"
            className="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface2 px-2 py-1 text-xs"
            style={{ left: `${((hover + 0.5) / buckets.length) * 100}%` }}
          >
            امتیاز <span className="num">{toFaDigits(hover)}–{toFaDigits(hover + 1)}</span>: <b className="num text-ink">{fa(buckets[hover])}</b> عنوان
          </div>
        )}
        <div className="mt-1 flex justify-between text-[11px] text-dim">
          {[0, 5, 10].map((t) => (
            <span key={t} className="num">
              {toFaDigits(t)}
            </span>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {buckets.map((n, i) => (
            <tr key={i}>
              <th scope="row">
                {i}–{i + 1}
              </th>
              <td>{n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function titleName(t: TitleRef) {
  return `${t.title_fa || t.title}${t.year ? ` (${toFaDigits(t.year)})` : ""}`;
}

function Explain({ params, onRecomputed }: { params: RankingParams | null; onRecomputed: () => void }) {
  const [q, setQ] = useState("");
  const debounced = useDebouncedValue(q.trim(), 300);
  const [hits, setHits] = useState<TitleRef[]>([]);
  const [data, setData] = useState<ScoreExplanation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sim, setSim] = useState<RankingParams | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!debounced) {
      setHits([]);
      return;
    }
    let cancelled = false;
    call<TitleRef[]>(`/titles?q=${encodeURIComponent(debounced)}`)
      .then((r) => !cancelled && setHits(r.data))
      .catch(() => !cancelled && setHits([]));
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => setSim(params), [params]);

  async function open(id: string) {
    setError(null);
    setHits([]);
    try {
      setData((await call<ScoreExplanation>(`/explain/${id}`)).data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در دریافت امتیاز");
    }
  }

  async function recompute() {
    if (!data) return;
    setSaving(true);
    try {
      await call("/recompute", { method: "POST", body: JSON.stringify({ entity_ids: [data.title.id] }) });
      await open(data.title.id);
      onRecomputed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در بازمحاسبه");
    } finally {
      setSaving(false);
    }
  }

  const b = data?.breakdown;
  const simulated = b && sim ? simulateScore(b, sim) : null;
  const changed = !!(sim && params && SIMULATED_PARAMS.some((k) => sim[k] !== params[k]));
  const stale = data && b && (data.stored_score == null || Math.abs(data.stored_score - b.final) > 0.009);
  const href = data ? detailPathFor(data.title.entity_type, data.title.slug) : null;
  const m = params?.ranking_min_votes ?? 0;

  return (
    <Panel title="چرا این امتیاز؟" note="امتیاز یک عنوان، قدم‌به‌قدم، با همان کدی که امتیاز را ذخیره می‌کند">
      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="جستجوی فیلم یا سریال (فارسی یا انگلیسی)…"
          aria-label="جستجوی عنوان"
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-gold/50"
        />
        {hits.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface2 py-1 shadow-xl">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => void open(h.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm hover:bg-surface">
                  <span className="truncate text-ink">{titleName(h)}</span>
                  <span className="text-xs text-dim">{h.entity_type === "tv_series" ? "سریال" : "فیلم"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      {data && b && (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {href ? (
                <Link href={href} target="_blank" className="text-base font-bold text-ink hover:text-teal">
                  {titleName(data.title)}
                </Link>
              ) : (
                <span className="text-base font-bold text-ink">{titleName(data.title)}</span>
              )}
              <span className="text-xs text-muted">
                ذخیره‌شده: <b className="num text-ink">{num(data.stored_score)}</b>
                {data.stored_at && (
                  <span title={fullDate(data.stored_at)}> ({relativeTimeFa(data.stored_at)})</span>
                )}
              </span>
            </div>
            <ol className="space-y-2 text-sm">
              {(
                [
                  [
                    "۱. میانگین کاربران (بیزی)",
                    b.user_votes
                      ? `${fa(b.user_votes)} رأی با میانگین ${num(b.user_avg)} از ۵، به میانگین سایت (${num(b.platform_avg)}) کشیده با m=${fa(m)}`
                      : `بدون رأی؛ همان میانگین سایت (${num(b.platform_avg)})`,
                    <><span className="num">{num(b.bayesian)}</span> از ۵</>,
                  ],
                  [
                    "۲. امتیاز بیرونی",
                    b.external_source === "prior"
                      ? "امتیاز IMDb یا TMDb ندارد؛ میانگین پیش‌فرض"
                      : `${SOURCE_LABEL[b.external_source]} ${num(b.external_rating, 1)} با ${fa(b.external_votes)} رأی، به میانگین پیش‌فرض کشیده`,
                    <><span className="num">{num(b.external)}</span> از ۱۰</>,
                  ],
                  [
                    "۳. ترکیب",
                    `وزن کاربران ${toFaDigits((b.user_weight * 100).toFixed(1))}٪ (با تعداد رأی بالا می‌رود)، بقیه بیرونی`,
                    <><span className="num">{num(b.blended)}</span> از ۱۰</>,
                  ],
                  [
                    "۴. اثر نبردها",
                    b.matches ? `Elo ${num(b.elo, 0)} در ${fa(b.matches)} نبرد` : "در نبردی شرکت نکرده",
                    <span className="num">{`${b.battle_adjustment >= 0 ? "+" : "−"}${num(Math.abs(b.battle_adjustment))}`}</span>,
                  ],
                ] as [string, string, React.ReactNode][]
              ).map(([label, why, value]) => (
                <li key={label} className="grid grid-cols-[1fr_auto] gap-x-3 rounded-lg bg-surface2 px-3 py-2">
                  <span className="font-bold text-ink">{label}</span>
                  <span className="row-span-2 self-center text-base text-ink">{value}</span>
                  <span className="text-xs text-muted">{why}</span>
                </li>
              ))}
              <li className="flex items-center justify-between rounded-lg border border-gold/40 bg-gold/10 px-3 py-2">
                <span className="font-bold text-gold">امتیاز نهایی با فرمول فعلی</span>
                <span className="num text-lg font-bold text-gold">{num(b.final)}</span>
              </li>
            </ol>
            {stale && (
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <span className="text-gold">امتیاز ذخیره‌شده با فرمول فعلی فرق دارد.</span>
                <button
                  type="button"
                  onClick={() => void recompute()}
                  disabled={saving}
                  className="rounded-lg border border-gold/50 px-3 py-1.5 text-xs text-gold transition hover:bg-gold/10 disabled:opacity-50"
                >
                  {saving ? "در حال ذخیره…" : "بازمحاسبه و ذخیره"}
                </button>
              </div>
            )}
          </div>

          {sim && simulated && (
            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-bold text-ink">اگر پارامترها فرق داشتند…</h3>
                {changed && (
                  <button type="button" onClick={() => setSim(params)} className="text-xs text-teal">
                    بازگردانی
                  </button>
                )}
              </div>
              <p className="mb-3 text-xs text-dim">فقط شبیه‌سازی است و چیزی ذخیره نمی‌شود.</p>
              <div className="grid grid-cols-2 gap-2">
                {SIMULATED_PARAMS.map((k) => (
                  <label key={k} className="text-xs text-muted">
                    {PARAM_INFO[k]?.label ?? k}
                    <input
                      type="number"
                      step="any"
                      dir="ltr"
                      value={sim[k]}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v >= 0) setSim({ ...sim, [k]: v });
                      }}
                      className={`mt-1 w-full rounded-md border bg-bg px-2 py-1 text-sm text-ink outline-none ${
                        params && sim[k] !== params[k] ? "border-gold/60" : "border-border"
                      }`}
                    />
                  </label>
                ))}
              </div>
              <div className="mt-3 flex items-baseline justify-between rounded-lg bg-surface2 px-3 py-2">
                <span className="text-sm text-ink">امتیاز شبیه‌سازی‌شده</span>
                <span className="text-lg font-bold text-ink">
                  <span className="num">{num(simulated.final)}</span>
                  {changed && (
                    <span className={`num ms-2 text-xs ${simulated.final > b.final ? "text-teal" : simulated.final < b.final ? "text-red-300" : "text-muted"}`} dir="ltr">
                      {simulated.final > b.final ? "+" : ""}
                      {toFaDigits((simulated.final - b.final).toFixed(2))}
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

export function AlgorithmsManager() {
  const [params, setParams] = useState<AlgorithmParam[] | null>(null);
  const [health, setHealth] = useState<AlgorithmsHealth | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const [drift, setDrift] = useState<DriftReport | null>(null);
  const [driftBusy, setDriftBusy] = useState<"check" | "fix" | null>(null);
  const [driftNote, setDriftNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [p, h] = await Promise.all([call<AlgorithmParam[]>("/params"), call<AlgorithmsHealth>("/health")]);
      setParams(p.data);
      setHealth(h.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rankingParams = useMemo<RankingParams | null>(() => {
    if (!params) return null;
    const get = (k: string) => Number(params.find((p) => p.key === k)?.value ?? 0);
    return Object.fromEntries(SIMULATED_PARAMS.map((k) => [k, get(k)])) as unknown as RankingParams;
  }, [params]);

  async function checkDrift() {
    setDriftBusy("check");
    setDriftNote(null);
    try {
      setDrift((await call<DriftReport>("/drift")).data);
    } catch (err) {
      setDriftNote({ ok: false, text: err instanceof Error ? err.message : "خطا در بررسی" });
    } finally {
      setDriftBusy(null);
    }
  }

  async function fixDrift() {
    if (!drift?.drifted_ids.length) return;
    setDriftBusy("fix");
    try {
      const res = await call<{ recomputed: number }>("/recompute", { method: "POST", body: JSON.stringify({ entity_ids: drift.drifted_ids }) });
      setDriftNote({ ok: true, text: `امتیاز ${fa(res.data.recomputed)} عنوان بازمحاسبه و ذخیره شد.` });
      setDrift((await call<DriftReport>("/drift")).data);
      void load();
    } catch (err) {
      setDriftNote({ ok: false, text: err instanceof Error ? err.message : "خطا در بازمحاسبه" });
    } finally {
      setDriftBusy(null);
    }
  }

  const rp = rankingParams;
  const h = health;

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted">
          {h ? (
            <>
              به‌روزرسانی <span title={fullDate(h.generated_at)}>{relativeTimeFa(h.generated_at)}</span>
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

      {error && !h && (
        <p className="text-sm text-muted">
          خطا در دریافت اطلاعات الگوریتم‌ها.{" "}
          <button onClick={load} className="text-teal">
            تلاش مجدد
          </button>
        </p>
      )}

      {rp && (
        <Panel title="فرمول امتیاز سینماگزین" note="با مقدارهای فعلی سرور">
          <div dir="ltr" className="space-y-1 overflow-x-auto rounded-lg bg-bg p-3 font-mono text-xs leading-relaxed text-ink-dim">
            <div>bayesian = (v/(v+{rp.ranking_min_votes}))·R + ({rp.ranking_min_votes}/(v+{rp.ranking_min_votes}))·C</div>
            <div>
              external = (V·r + M·{rp.ranking_external_prior}) / (V + M) &nbsp;
              <span className="text-dim">M = {rp.ranking_imdb_min_votes} (IMDb) | {rp.ranking_tmdb_min_votes} (TMDb)</span>
            </div>
            <div>α = {rp.ranking_user_weight} · v/(v+{rp.ranking_min_votes})</div>
            <div>blended = α·(bayesian·2) + (1−α)·external</div>
            <div>
              battle = {rp.ranking_battle_weight} · n/(n+{rp.ranking_battle_min_matches}) · clamp((elo−1200)/400, −1, 1)
            </div>
            <div className="text-gold">score = blended + battle</div>
          </div>
          <p className="mt-2 text-xs text-dim">
            R و v: میانگین و تعداد امتیاز کاربران (۱ تا ۵)؛ C: میانگین همهٔ امتیازهای سایت
            {h?.platform_avg != null && (
              <>
                {" "}
                (اکنون <span className="num">{num(h.platform_avg)}</span>)
              </>
            )}
            ؛ r و V: امتیاز و تعداد رأی IMDb، یا TMDb وقتی IMDb نیست؛ elo و n: Elo و تعداد نبرد عنوان.
          </p>
        </Panel>
      )}

      {h && (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {h.types.map((t) => (
              <Panel key={t.entity_type} title={TYPE_LABEL[t.entity_type]} note={<span className="num">{fa(t.total)}</span>}>
                <div className="grid grid-cols-3 gap-2">
                  <StatCard label="امتیاز دارند" value={t.ranked} hint={`${toFaDigits(pct(t.ranked, t.total))}٪`} />
                  <StatCard label="رأی کاربر دارند" value={t.with_user_votes} hint={`${toFaDigits(pct(t.with_user_votes, t.total))}٪`} />
                  <StatCard label="در نبرد بوده‌اند" value={t.with_battles} hint={`${toFaDigits(pct(t.with_battles, t.total))}٪`} />
                </div>
                <div className="mt-4">
                  <Histogram buckets={t.histogram} title="توزیع امتیاز نهایی (از ۱۰)" />
                </div>
                {t.last_recompute_at && (
                  <p className="mt-3 text-xs text-dim">
                    آخرین بازمحاسبه <span title={fullDate(t.last_recompute_at)}>{relativeTimeFa(t.last_recompute_at)}</span>
                    {t.oldest_recompute_at && (
                      <>
                        {" "}
                        · قدیمی‌ترین <span title={fullDate(t.oldest_recompute_at)}>{relativeTimeFa(t.oldest_recompute_at)}</span>
                      </>
                    )}
                  </p>
                )}
              </Panel>
            ))}
          </div>

          <Panel title="امتیازهای عقب‌مانده" note="امتیاز ذخیره‌شده فقط وقتی عوض می‌شود که عنوان sync شود، امتیاز یا نبرد بگیرد، یا اسکریپت recompute_rankings.py اجرا شود">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void checkDrift()}
                disabled={driftBusy != null}
                className="rounded-lg border border-border px-3 py-2 text-sm text-ink transition hover:border-gold/50 disabled:opacity-50"
              >
                {driftBusy === "check" ? "در حال بررسی…" : "بررسی ۳۰۰ عنوان پررأی"}
              </button>
              {drift && (
                <span className="text-sm text-muted">
                  از <span className="num">{fa(drift.checked)}</span> عنوان،{" "}
                  {drift.drifted ? (
                    <>
                      امتیاز <b className="num text-gold">{fa(drift.drifted)}</b> عنوان با فرمول فعلی فرق دارد.
                    </>
                  ) : (
                    "همه با فرمول فعلی یکی‌اند."
                  )}
                </span>
              )}
              {drift && drift.drifted > 0 && (
                <button
                  type="button"
                  onClick={() => void fixDrift()}
                  disabled={driftBusy != null}
                  className="rounded-lg bg-gold px-3 py-2 text-sm font-bold text-bg transition hover:brightness-110 disabled:opacity-50"
                >
                  {driftBusy === "fix" ? "در حال بازمحاسبه…" : `بازمحاسبهٔ ${fa(drift.drifted)} عنوان`}
                </button>
              )}
            </div>
            {driftNote && <p className={`mt-3 text-sm ${driftNote.ok ? "text-teal" : "text-red-300"}`}>{driftNote.text}</p>}
            {drift && drift.rows.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="text-xs text-dim">
                    <th className="pb-2 text-start font-normal">عنوان</th>
                    <th className="pb-2 text-start font-normal">ذخیره‌شده</th>
                    <th className="pb-2 text-start font-normal">با فرمول فعلی</th>
                    <th className="pb-2 text-start font-normal">تفاوت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft">
                  {drift.rows.map((r) => {
                    const diff = r.current_score - (r.stored_score ?? 0);
                    return (
                      <tr key={r.title.id}>
                        <td className="py-2 pe-3 text-ink">{titleName(r.title)}</td>
                        <td className="py-2 pe-3 text-muted">
                          <span className="num">{num(r.stored_score)}</span>
                        </td>
                        <td className="py-2 pe-3 text-ink">
                          <span className="num">{num(r.current_score)}</span>
                        </td>
                        <td className={`py-2 ${diff > 0 ? "text-teal" : "text-red-300"}`}>
                          <span className="num">
                            {r.stored_score == null ? "بدون امتیاز" : `${diff > 0 ? "+" : "−"}${num(Math.abs(diff))}`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </>
      )}

      <Explain params={rankingParams} onRecomputed={() => void load()} />

      {h && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Elo نبردها">
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="عنوان با سابقهٔ نبرد" value={h.elo_entities} />
              <StatCard label="بیشترین Elo" value={h.elo_max != null ? Math.round(h.elo_max) : 0} />
              <StatCard label="کمترین Elo" value={h.elo_min != null ? Math.round(h.elo_min) : 0} />
            </div>
            <p className="mt-2 text-xs text-dim">همه از ۱۲۰۰ شروع می‌کنند؛ فاصله از ۱۲۰۰ (تا ±۴۰۰) اثر نبرد بر امتیاز را می‌سازد.</p>
          </Panel>
          <Panel title="Taste DNA">
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="کاربر با پروفایل سلیقه" value={h.taste.users_with_snapshot} />
              <StatCard label="محاسبه در ۷ روز" value={h.taste.computed_7d} />
              <StatCard label="ردیف امتیاز مشارکت" value={h.taste.contribution_rows} />
            </div>
            <p className="mt-2 text-xs text-dim">
              میانگین اطمینان مدل: <span className="num">{h.taste.avg_confidence != null ? `${toFaDigits(Math.round(h.taste.avg_confidence * 100))}٪` : "—"}</span>
              {h.taste.last_computed_at && (
                <>
                  {" "}
                  · آخرین محاسبه <span title={fullDate(h.taste.last_computed_at)}>{relativeTimeFa(h.taste.last_computed_at)}</span>
                </>
              )}
            </p>
          </Panel>
        </div>
      )}

      {params && (
        <section aria-label="پارامترها" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-ink-dim">پارامترها</h2>
            <p className="text-xs text-dim">
              فقط‌خواندنی. برای تغییر، متغیر محیطی را روی Liara عوض و بک‌اند را دوباره راه‌اندازی کنید، بعد{" "}
              <code dir="ltr">python scripts/recompute_rankings.py</code> را اجرا کنید تا امتیازهای ذخیره‌شده به‌روز شوند.
            </p>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {GROUPS.map((g) => (
              <Panel key={g.key} title={g.title} note={g.note}>
                <ul className="divide-y divide-border-soft text-sm">
                  {params
                    .filter((p) => p.group === g.key)
                    .map((p) => (
                      <li key={p.key} className="grid grid-cols-[1fr_auto] gap-x-3 py-2">
                        <span className="text-ink">{PARAM_INFO[p.key]?.label ?? p.key}</span>
                        <span className="num row-span-2 self-center rounded-md bg-surface2 px-2 py-0.5 text-ink" dir="ltr">
                          {String(p.value)}
                        </span>
                        <span className="text-xs text-muted">
                          {PARAM_INFO[p.key]?.help}
                          <code className="ms-2 text-[11px] text-dim" dir="ltr">
                            {p.env ?? `elo.${p.key}`}
                          </code>
                        </span>
                      </li>
                    ))}
                </ul>
              </Panel>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
