"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Reveal from "./Reveal";
import SectionHeading from "./SectionHeading";
import { toFaDigits } from "@/lib/format-number";

const STEPS = [
  { n: "۱", title: "یک عنوان بنویس", body: "مثلاً «فیلم‌های نولان به ترتیب علاقه». همین‌قدر کافی است." },
  { n: "۲", title: "فیلم اضافه کن", body: "جستجو کن و بزن؛ ترتیبش را هر وقت خواستی با کشیدن عوض کن." },
  { n: "۳", title: "منتشر کن", body: "فهرستت به نقشهٔ RankVerse وصل می‌شود و دیگران می‌توانند آن را ببینند و دنبال کنند." },
];

type Tone = "people" | "genre";
interface Film {
  title: string;
  year: number;
  poster: string;
  reason?: string;
  tone?: Tone;
}

// Illustrative content (real titles, fixed posters): the list a demo starts
// with and the graph suggestions it offers, with the same kind of "why" the
// real editor shows next to each candidate. One demo is picked at random.
interface Demo {
  name: string;
  start: Film[];
  suggestions: Film[];
}
const DEMOS: Demo[] = [
  {
    name: "فیلم‌های نولان",
    start: [
      { title: "تلقین", year: 2010, poster: "/xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg" },
      { title: "در میان ستاره‌ای", year: 2014, poster: "/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg" },
      { title: "شوالیهٔ تاریکی", year: 2008, poster: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg" },
    ],
    suggestions: [
      { title: "تنت", year: 2020, poster: "/aCIFMriQh8rvhxpN1IWGgvH0Tlg.jpg", reason: "هم‌کارگردان با تلقین · کریستوفر نولان", tone: "people" },
      { title: "حیثیت", year: 2006, poster: "/Ag2B2KHKQPukjH7WutmgnnSNurZ.jpg", reason: "کریستین بیل در شوالیهٔ تاریکی هم بود", tone: "people" },
      { title: "یادگاری", year: 2000, poster: "/nzlv62aC0octS5AklAiWpXLX9Z0.jpg", reason: "هم‌ژانر با ۳ فیلم فهرست · معمایی", tone: "genre" },
      { title: "دانکرک", year: 2017, poster: "/b4Oe15CGLL61Ped0RAS9JpqdmCt.jpg", reason: "هم‌کارگردان با ۴ فیلم فهرست", tone: "people" },
    ],
  },
  {
    name: "فیلم‌های اصغر فرهادی",
    start: [
      { title: "درباره الی", year: 2009, poster: "/ctLrMQrg3kss2JO7OIr7RVdN5an.jpg" },
      { title: "جدایی نادر از سیمین", year: 2011, poster: "/xQadpnoLokxzN3hRpCPbBGpxsiz.jpg" },
      { title: "فروشنده", year: 2016, poster: "/x4PIuYU5ZMMXiTrheNR8vCTYPBf.jpg" },
    ],
    suggestions: [
      { title: "قهرمان", year: 2021, poster: "/5VBPRWW13OJoiLA6suLofnjLKou.jpg", reason: "هم‌کارگردان با فروشنده · اصغر فرهادی", tone: "people" },
      { title: "چهارشنبه‌سوری", year: 2006, poster: "/7PHP13zg4Ym5kzTwts6WM2xovxn.jpg", reason: "هم‌کارگردان با ۳ فیلم فهرست", tone: "people" },
      { title: "گذشته", year: 2013, poster: "/8nff89qjYN3Hck5G33xeRPsM8TZ.jpg", reason: "هم‌ژانر با ۳ فیلم فهرست · درام", tone: "genre" },
      { title: "همه می‌دانند", year: 2018, poster: "/1TuuM451os3NaltCwGfPCVL2BST.jpg", reason: "هم‌کارگردان با ۴ فیلم فهرست", tone: "people" },
    ],
  },
];
const VISIBLE_SUGGESTIONS = 2;

const TONE = {
  people: { text: "text-violet-light", dot: "bg-violet-light" },
  genre: { text: "text-teal", dot: "bg-teal" },
};

function Poster({ film, className }: { film: Film; className: string }) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-lg border border-border bg-surface2 ${className}`}>
      <Image src={`https://image.tmdb.org/t/p/w185${film.poster}`} alt="" fill sizes="64px" className="object-cover" />
    </div>
  );
}

/**
 * Home-page invitation to build lists. The right-hand card is a small live
 * demo: tap a graph suggestion and it joins the list (the next one appears),
 * which is the whole point of the editor -- a few taps, no typing. The films
 * are illustrative, not fetched.
 */
export default function ListCreatorPromo() {
  // The server renders the first demo; the random pick happens after mount so
  // hydration matches.
  const [demoIndex, setDemoIndex] = useState(0);
  useEffect(() => setDemoIndex(Math.floor(Math.random() * DEMOS.length)), []);
  const demo = DEMOS[demoIndex];
  const [added, setAdded] = useState<Film[]>([]);
  const items = [...demo.start, ...added];
  const pending = demo.suggestions.filter((s) => !added.includes(s));

  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <SectionHeading
        kicker="Build your own constellation"
        title="فهرست خودت را بساز؛ کمتر از دو دقیقه."
        lead="لازم نیست همه‌چیز را از حفظ باشی. هر فیلمی که اضافه کنی، گراف RankVerse فیلم بعدی را پیشنهاد می‌دهد."
      />

      <div className="grid items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <ol className="flex flex-col gap-6">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="num flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-light/50 bg-violet-light/10 text-sm font-bold text-violet-light">
                  {s.n}
                </span>
                <div>
                  <h3 className="text-base font-bold text-ink">{s.title}</h3>
                  <p className="mt-1 text-sm leading-7 text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <ul className="mt-8 flex flex-wrap gap-2 text-xs text-ink-dim">
            {["بدون پیچیدگی", "پیشنهاد هوشمند از گراف", "ترتیب قابل‌تغییر", "عمومی یا خصوصی"].map((t) => (
              <li key={t} className="rounded-full border border-border bg-surface/60 px-3 py-1">
                {t}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/lists/new" className="btn-primary text-sm hover:opacity-90">
              ساخت فهرست جدید
            </Link>
            <Link href="/lists" className="text-sm text-teal hover:underline">
              دیدن فهرست‌های دیگران ←
            </Link>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="rounded-3xl border border-border bg-surface/60 p-5 shadow-[0_0_60px_rgba(145,99,245,0.12)] sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-violet-light">نمونه · {demo.name}</p>
              <span dir="rtl" className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">
                {toFaDigits(items.length)} فیلم
              </span>
            </div>

            {/* The list, as a spine with a numbered node per film. */}
            <ul className="relative mt-5 flex flex-col gap-3">
              <span aria-hidden="true" className="absolute bottom-6 start-[15px] top-6 w-px bg-border" />
              {items.map((film, i) => (
                <li key={film.title} className="battle-swap relative flex items-center gap-4">
                  <span className="num relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-light/60 bg-bg text-xs text-violet-light">
                    {toFaDigits(i + 1)}
                  </span>
                  <Poster film={film} className="h-[72px] w-12" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{film.title}</p>
                    <p className="num mt-[3px] text-right text-xs text-dim">{toFaDigits(film.year)}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-5 border-t border-dashed border-border pt-5">
              {pending.length > 0 ? (
                <>
                  <p className="mb-3 text-xs text-dim">پیشنهاد گراف برای ادامه — روی یکی بزن</p>
                  <ul className="flex flex-col gap-2.5">
                    {pending.slice(0, VISIBLE_SUGGESTIONS).map((s) => {
                      const tone = TONE[s.tone ?? "people"];
                      return (
                        <li key={s.title}>
                          <button
                            type="button"
                            onClick={() => setAdded((a) => [...a, s])}
                            aria-label={`افزودن ${s.title} به فهرست`}
                            className="battle-swap flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-bg/60 p-2.5 text-start transition hover:border-violet-light/70 hover:bg-violet-light/5"
                          >
                            <Poster film={s} className="h-[60px] w-10" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-bold text-ink">
                                {s.title}{" "}
                                <span className="num inline-block text-xs font-normal text-dim">{toFaDigits(s.year)}</span>
                              </span>
                              <span className={`flex items-center gap-2 text-xs ${tone.text}`}>
                                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
                                {s.reason}
                              </span>
                            </span>
                            <span
                              aria-hidden="true"
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-violet-light/60 text-violet-light"
                            >
                              +
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <p className="text-center text-sm text-teal">
                  فهرستت آماده است — با چند کلیک ساخته شد.{" "}
                  <Link href="/lists/new" className="font-bold underline hover:text-ink">
                    نوبت فهرست خودت است.
                  </Link>
                </p>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
