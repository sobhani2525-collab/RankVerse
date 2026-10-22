"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { seoChecks, type AdminSeoOverview, type SeoCheck, type SeoInspection, type SeoTitleContent } from "@/lib/admin-seo";
import { adminApiCall } from "@/lib/admin-users";
import { fullDate } from "@/lib/admin-format";
import { detailPathFor } from "@/lib/entity-routes";
import { toFaDigits } from "@/lib/format-number";
import { relativeTimeFa } from "@/lib/relative-time";
import { SITE_URL } from "@/lib/site";
import { SITEMAP_CHUNK } from "@/lib/sitemap";
import { StatCard } from "../_components/StatCard";

const fa = (n: number) => toFaDigits(n.toLocaleString("en-US"));
const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

const GAP_LABEL: Record<string, string> = { title_fa: "عنوان فارسی", overview_fa: "خلاصهٔ فارسی", poster: "پوستر" };

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

/** "How many have it": a coverage meter with the missing count beside it. */
function Coverage({ label, missing, total, hint }: { label: string; missing: number; total: number; hint?: string }) {
  const have = pct(total - missing, total);
  return (
    <li className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink">{label}</span>
        <span className="text-xs text-muted">
          <b className="num text-ink">{toFaDigits(have)}٪</b> دارند
          {missing > 0 && (
            <>
              {" "}
              · <span className="num">{fa(missing)}</span> ندارند
            </>
          )}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface2" role="meter" aria-valuenow={have} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-teal" style={{ width: `${have}%` }} />
      </div>
      {hint && <p className="text-xs text-dim">{hint}</p>}
    </li>
  );
}

function TitleCoverage({ c }: { c: SeoTitleContent }) {
  return (
    <ul className="space-y-4">
      <Coverage label="عنوان فارسی" missing={c.missing_title_fa} total={c.total} hint="بدون آن، عنوان صفحه و نتیجهٔ جستجو انگلیسی است." />
      <Coverage
        label="خلاصهٔ فارسی"
        missing={c.missing_overview_fa}
        total={c.total}
        hint={`توضیحات متا از خلاصه ساخته می‌شود.${c.machine_overview ? ` ${fa(c.machine_overview)} خلاصه ترجمهٔ ماشینی است.` : ""}`}
      />
      <Coverage label="پوستر" missing={c.missing_poster} total={c.total} hint="تصویر پیش‌نمایش (og:image) و نتیجهٔ بزرگ گوگل." />
    </ul>
  );
}

const CHECK_TONE: Record<SeoCheck["level"], string> = {
  ok: "text-teal",
  warn: "text-gold",
  error: "text-red-300",
};
const CHECK_ICON: Record<SeoCheck["level"], string> = { ok: "✓", warn: "!", error: "✕" };

interface InspectRequest {
  path: string;
  n: number; // bumps so asking for the same page again re-runs it
}

function Inspector({ examples, request }: { examples: { label: string; path: string }[]; request: InspectRequest | null }) {
  const [path, setPath] = useState("/");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SeoInspection | null>(null);

  const inspect = useCallback(async (p: string) => {
    setPath(p);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/seo-inspect?path=${encodeURIComponent(p)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) throw new Error(json?.error?.message || `خطا (${res.status})`);
      setResult(json.data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "خطا در بررسی صفحه");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (request) void inspect(request.path);
  }, [request, inspect]);

  const checks = result ? seoChecks(result) : [];
  const shownUrl = result ? decodeURI(new URL(result.url).pathname) : "";

  return (
    <Panel title="بررسی یک صفحه" note="صفحه همان‌طور که Googlebot می‌گیرد خوانده می‌شود">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void inspect(path.trim());
        }}
      >
        <input
          dir="ltr"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/movies/…"
          aria-label="مسیر صفحه"
          className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-gold/50"
        />
        <button
          type="submit"
          disabled={busy || !path.trim()}
          className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-bg transition hover:brightness-110 disabled:opacity-50"
        >
          {busy ? "در حال بررسی…" : "بررسی"}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        {examples.map((x) => (
          <button
            key={x.path}
            type="button"
            onClick={() => void inspect(x.path)}
            className="rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:border-gold/30 hover:text-ink"
          >
            {x.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

      {result && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 text-xs text-dim">پیش‌نمایش در نتایج گوگل</div>
              <div className="rounded-lg bg-white p-4 text-start" dir="rtl">
                <div className="truncate text-xs text-[#4d5156]" dir="ltr">
                  {new URL(result.url).host} › {shownUrl.split("/").filter(Boolean).join(" › ")}
                </div>
                <div className="mt-1 line-clamp-1 text-lg leading-snug text-[#1a0dab]">{result.title ?? "(بدون عنوان)"}</div>
                <div className="mt-1 line-clamp-2 text-sm leading-relaxed text-[#4d5156]">{result.description ?? "(بدون توضیحات)"}</div>
              </div>
            </div>
            <ul className="space-y-1.5 text-sm">
              {checks.map((c) => (
                <li key={c.text} className={`flex gap-2 ${CHECK_TONE[c.level]}`}>
                  <span aria-hidden className="w-4 shrink-0 text-center font-bold">
                    {CHECK_ICON[c.level]}
                  </span>
                  <span className="text-ink">{c.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
            {(
              [
                ["وضعیت", `${result.status}${result.redirect ? ` → ${result.redirect}` : ""} · ${result.ms}ms`],
                ["canonical", result.canonical],
                ["robots", [result.robots, result.xRobotsTag && `X-Robots-Tag: ${result.xRobotsTag}`].filter(Boolean).join(" · ") || null],
                ["زبان", result.lang],
                ["og:title", result.ogTitle],
                ["og:description", result.ogDescription],
                ["twitter:card", result.twitterCard],
                ["JSON-LD", result.jsonLdTypes.join("، ") || null],
                ["تیتر h1", toFaDigits(result.h1Count)],
              ] as [string, string | null][]
            ).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-dim">{k}</dt>
                <dd className={`min-w-0 break-words ${v ? "text-ink" : "text-dim"}`} dir="auto">
                  {v ?? "—"}
                </dd>
              </div>
            ))}
            <dt className="text-dim">og:image</dt>
            <dd>
              {result.ogImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.ogImage} alt="" className="h-24 rounded-md border border-border object-cover" />
              ) : (
                <span className="text-dim">—</span>
              )}
            </dd>
          </dl>
        </div>
      )}
    </Panel>
  );
}

export function SeoManager() {
  const [data, setData] = useState<AdminSeoOverview | null>(null);
  const [inspectRequest, setInspectRequest] = useState<InspectRequest | null>(null);
  const inspectPage = (path: string) => {
    setInspectRequest((r) => ({ path, n: (r?.n ?? 0) + 1 }));
    document.getElementById("seo-inspector")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setData((await adminApiCall<AdminSeoOverview>("seo", "/overview")).data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const d = data;
  const sm = d?.sitemap;
  const files = sm
    ? 2 + [sm.movie, sm.tv_series, sm.person, sm.genre].reduce((a, n) => a + Math.ceil(n / SITEMAP_CHUNK), 0)
    : 0;
  const totalUrls = sm ? sm.movie + sm.tv_series + sm.person + sm.genre + sm.lists : null;
  const firstGap = d?.gaps[0];
  const firstGapPath = firstGap ? detailPathFor(firstGap.entity_type, firstGap.slug) : null;
  const examples = [
    { label: "صفحهٔ اصلی", path: "/" },
    { label: "رتبه‌بندی", path: "/rankings" },
    { label: "فهرست‌ها", path: "/lists" },
    ...(firstGap && firstGapPath ? [{ label: firstGap.title, path: firstGapPath }] : []),
  ];

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <a href={`${SITE_URL}/sitemap.xml`} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-3 py-2 text-sm text-ink transition hover:border-gold/50" dir="ltr">
          sitemap.xml
        </a>
        <a href={`${SITE_URL}/robots.txt`} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-3 py-2 text-sm text-ink transition hover:border-gold/50" dir="ltr">
          robots.txt
        </a>
        <p className="text-xs text-muted">
          {d ? (
            <>
              به‌روزرسانی <span title={fullDate(d.generated_at)}>{relativeTimeFa(d.generated_at)}</span> · اعداد تا ده دقیقه کش می‌شوند
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
          خطا در دریافت وضعیت SEO.{" "}
          <button onClick={load} className="text-teal">
            تلاش مجدد
          </button>
        </p>
      )}

      {!(error && !d) && (
        <section aria-label="نقشهٔ سایت" className="space-y-3">
          <h2 className="text-sm font-bold text-ink-dim">
            نقشهٔ سایت
            {totalUrls != null && (
              <span className="ms-2 text-xs font-normal text-dim">
                <span className="num">{fa(totalUrls)}</span> آدرس در <span className="num">{fa(files)}</span> فایل (به‌جز صفحه‌های ثابت)
              </span>
            )}
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard label="فیلم‌ها" value={sm?.movie ?? null} />
            <StatCard label="سریال‌ها" value={sm?.tv_series ?? null} />
            <StatCard label="افراد" value={sm?.person ?? null} hint={d ? `${fa(d.people.without_credits)} نفر بدون اثر بیرون مانده‌اند` : undefined} />
            <StatCard label="ژانرها" value={sm?.genre ?? null} />
            <StatCard label="فهرست‌ها" value={sm?.lists ?? null} href="/admin/lists" hint="عمومی، غیرخالی، پنهان‌نشده" />
          </div>
        </section>
      )}

      {d && (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            <Panel title="فیلم‌ها" note={<span className="num">{fa(d.movies.total)}</span>}>
              <TitleCoverage c={d.movies} />
            </Panel>
            <Panel title="سریال‌ها" note={<span className="num">{fa(d.tv_series.total)}</span>}>
              <TitleCoverage c={d.tv_series} />
            </Panel>
            <Panel title="افراد" note={<span className="num">{fa(d.people.total)}</span>}>
              <ul className="space-y-4">
                <Coverage
                  label="زندگی‌نامه"
                  missing={d.people.missing_biography}
                  total={d.people.total}
                  hint="صفحهٔ فرد بدون زندگی‌نامه و با کمتر از ۳ اثر noindex می‌شود."
                />
                <Coverage label="زندگی‌نامهٔ فارسی" missing={d.people.missing_biography + d.people.english_biography} total={d.people.total} />
                <Coverage label="حداقل یک اثر" missing={d.people.without_credits} total={d.people.total} hint="افراد بدون اثر در نقشهٔ سایت نیستند." />
              </ul>
            </Panel>
          </div>

          <Panel
            title="اولویت اصلاح"
            note={
              <>
                پربازدیدترین عنوان‌هایی که چیزی کم دارند ·{" "}
                <Link href="/admin/entities" className="text-teal">
                  ویرایش خلاصه‌ها
                </Link>
              </>
            }
          >
            {d.gaps.length === 0 ? (
              <p className="py-6 text-center text-sm text-dim">همهٔ فیلم‌ها و سریال‌ها عنوان فارسی، خلاصهٔ فارسی و پوستر دارند.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-dim">
                      <th className="pb-2 text-start font-normal">عنوان</th>
                      <th className="pb-2 text-start font-normal">رأی TMDb</th>
                      <th className="pb-2 text-start font-normal">کمبود</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-soft">
                    {d.gaps.map((g) => {
                      const href = detailPathFor(g.entity_type, g.slug);
                      return (
                        <tr key={g.id}>
                          <td className="py-2 pe-3">
                            {href ? (
                              <Link href={href} target="_blank" className="text-ink hover:text-teal">
                                {g.title}
                              </Link>
                            ) : (
                              <span className="text-ink">{g.title}</span>
                            )}
                            <span className="ms-2 text-xs text-dim">
                              {g.entity_type === "tv_series" ? "سریال" : "فیلم"}
                              {g.year != null && <span className="num"> · {toFaDigits(g.year)}</span>}
                            </span>
                          </td>
                          <td className="py-2 pe-3 text-muted">
                            <span className="num">{g.vote_count != null ? fa(g.vote_count) : "—"}</span>
                          </td>
                          <td className="py-2 pe-3">
                            <div className="flex flex-wrap gap-1">
                              {g.missing.map((m) => (
                                <span key={m} className="rounded-md border border-gold/30 bg-gold/10 px-2 py-0.5 text-xs text-gold">
                                  {GAP_LABEL[m] ?? m}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="whitespace-nowrap py-2 text-end text-xs">
                            {g.missing.includes("overview_fa") && (
                              <Link href={`/admin/entities?q=${encodeURIComponent(g.title)}`} className="text-teal">
                                نوشتن خلاصه
                              </Link>
                            )}
                            {href && (
                              <button type="button" onClick={() => inspectPage(href)} className="ms-3 text-muted hover:text-ink">
                                بررسی صفحه
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="کشف‌پذیری فهرست‌ها" note={<Link href="/admin/lists" className="text-teal">مدیریت فهرست‌ها</Link>}>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {(
                  [
                    ["قابل ایندکس", d.lists.indexable, "در نقشهٔ سایت و نتایج جستجو"],
                    ["عمومی ولی خالی", d.lists.empty_public, "noindex تا وقتی چیزی اضافه شود"],
                    ["پنهان‌شده توسط ادمین", d.lists.hidden, "با لینک باز می‌شود، در فهرست‌ها و نقشهٔ سایت نیست"],
                    ["خصوصی", d.lists.private, "فقط برای صاحبش"],
                  ] as [string, number, string][]
                ).map(([label, n, hint]) => (
                  <div key={label} className="rounded-lg bg-surface2 p-3">
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="num mt-1 text-xl font-bold text-ink">{fa(n)}</dd>
                    <dd className="mt-1 text-xs text-dim">{hint}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
            <Panel title="کشف‌پذیری نبردها" note={<Link href="/admin/battles" className="text-teal">مدیریت نبردها</Link>}>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {(
                  [
                    ["عمومی", d.battles.public, "قابل ایندکس و در فهرست نبردها"],
                    ["فقط با لینک", d.battles.unlisted, "noindex"],
                    ["پنهان‌شده توسط ادمین", d.battles.hidden, "عمومی ولی بیرون از فهرست‌ها"],
                  ] as [string, number, string][]
                ).map(([label, n, hint]) => (
                  <div key={label} className="rounded-lg bg-surface2 p-3">
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="num mt-1 text-xl font-bold text-ink">{fa(n)}</dd>
                    <dd className="mt-1 text-xs text-dim">{hint}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>
        </>
      )}

      <div id="seo-inspector" className="scroll-mt-6">
        <Inspector examples={examples} request={inspectRequest} />
      </div>
    </div>
  );
}
