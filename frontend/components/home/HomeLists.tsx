"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import ListTicketCard from "@/components/lists/list-ticket-card";
import { listSummaryToTicketCard } from "@/lib/entity-card-adapters";
import ScrollRow from "@/components/ScrollRow";
import { entityPosterUrl } from "@/lib/list-constellation";
import { listHref } from "@/lib/list-url";
import { toFaDigits } from "@/lib/format-number";
import { LIST_TABS, ListTab, shuffle, withoutFeatured } from "@/lib/home-lists";
import type { ListDetail, ListSummary } from "@/lib/types";

type Cache = Partial<Record<ListTab, ListSummary[]>>;

/** The lists section: this week's featured list as a big ranked card, tabs, list cards and a dashed «new list» card. */
export default function HomeLists({ featured, initialPicked }: { featured: ListDetail | null; initialPicked: ListSummary[] }) {
  const [tab, setTab] = useState<ListTab>("foryou");
  const [cache, setCache] = useState<Cache>({ picked: initialPicked });
  const [failedTab, setFailedTab] = useState<ListTab | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [nearLists, setNearLists] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const items = cache[tab];

  // The server-rendered «picked» cards are ISR-cached; reshuffle them per visit (client-only, after hydration).
  useEffect(() => {
    setCache((c) => (c.picked ? { ...c, picked: shuffle(c.picked) } : c));
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") {
      setNearLists(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setNearLists(true);
      observer.disconnect();
    }, { rootMargin: "400px 0px" });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearLists || items) return;
    const controller = new AbortController();
    setFailedTab(null);
    fetch(`/api/home-lists?tab=${tab}`, { signal: controller.signal })
      .then(async (response): Promise<ListSummary[]> => {
        if (!response.ok) throw new Error(`Home lists request failed (${response.status})`);
        return response.json();
      })
      .then((lists) => {
        if (!controller.signal.aborted) setCache((c) => ({ ...c, [tab]: shuffle(lists) }));
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailedTab(tab);
      });
    return () => controller.abort();
  }, [tab, items, attempt, nearLists]);

  const cards = items ? withoutFeatured(items, featured?.slug ?? null, 5) : null;

  return (
    <section ref={sectionRef} className="mx-auto max-w-7xl px-6 py-14" aria-label="فهرست‌ها">
      <h2 className="mb-6 text-2xl font-extrabold text-ink">فهرست‌ها</h2>

      {featured && featured.items.length > 0 && <FeaturedCard list={featured} />}

      <div role="tablist" aria-label="دسته‌بندی فهرست‌ها" className="mb-6 mt-8 flex gap-2 overflow-x-auto">
        {LIST_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => {
              setNearLists(true);
              setTab(t.key);
            }}
            className={`min-h-11 shrink-0 rounded-full border px-5 text-sm font-semibold focus-visible:outline-gold ${
              tab === t.key ? "border-[#a99bff] bg-[#a99bff] text-[#0b0d1c]" : "border-[#2a2f5c] text-[#c4c8e6] hover:border-[#a99bff]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {failedTab === tab ? (
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
          <p role="alert">دریافت فهرست‌ها ممکن نشد.</p>
          <button type="button" className="min-h-11 text-teal underline" onClick={() => setAttempt((value) => value + 1)}>
            تلاش دوباره
          </button>
          {tab !== "picked" && !!cache.picked?.length && (
            <button type="button" className="min-h-11 text-teal underline" onClick={() => setTab("picked")}>
              مشاهدهٔ برگزیده‌ها
            </button>
          )}
        </div>
      ) : cards === null ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-3xl bg-surface2/50" />)}
        </div>
      ) : (
        <ScrollRow
          as="div"
          arrowClassName="md:hidden"
          className="no-scrollbar flex snap-x snap-mandatory scroll-px-1 gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:gap-6 md:overflow-visible lg:grid-cols-3"
        >
          {cards.map((list) => (
            <div key={list.id} className="flex w-[82%] shrink-0 snap-start md:w-auto">
              <ListTicketCard list={listSummaryToTicketCard(list)} />
            </div>
          ))}
          <Link
            href="/lists/new"
            className="flex w-[82%] shrink-0 snap-start min-h-72 md:w-auto flex-col justify-center gap-3 rounded-3xl border border-dashed border-[#a99bff]/50 p-6 hover:bg-[#a99bff]/5"
          >
            <span className="text-xs text-[#a99bff]">فهرست جدید</span>
            <span className="text-lg font-extrabold leading-8 text-ink">فهرست خودت را بساز؛ کمتر از دو دقیقه</span>
            <span className="text-sm leading-7 text-[#a3a8cc]">یک عنوان بنویس، فیلم‌ها را اضافه کن؛ گراف فیلم بعدی را پیشنهاد می‌دهد.</span>
            <span className="mt-2 inline-flex min-h-11 w-fit items-center rounded-xl bg-white px-4 text-sm font-bold text-bg">+ فهرست جدید</span>
          </Link>
        </ScrollRow>
      )}

      <div className="mt-8 text-center">
        <Link href="/lists" className="text-sm text-teal hover:underline">مشاهدهٔ همهٔ فهرست‌ها ←</Link>
      </div>
    </section>
  );
}

function FeaturedCard({ list }: { list: ListDetail }) {
  return (
    <article className="grid min-w-0 grid-cols-1 items-center gap-6 rounded-3xl border border-border bg-surface p-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]">
      <div>
        <p className="text-xs font-bold text-[#f5b94a]">فهرست برگزیدهٔ این هفته</p>
        <h3 className="mt-2 text-2xl font-extrabold leading-9 text-ink">{list.title}</h3>
        <p className="mt-2 text-sm text-[#a3a8cc]">
          {list.owner_username && <>ساختهٔ {list.owner_username} · </>}
          <span className="num">{toFaDigits(list.items.length)}</span> عنوان · <span className="num">{toFaDigits(list.like_count)}</span> پسند
        </p>
        <Link href={listHref(list.slug)} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-gradient-to-l from-[#a99bff] to-[#5fd8bf] px-5 text-sm font-extrabold text-[#0b0d1c]">
          مشاهدهٔ فهرست کامل
        </Link>
      </div>
      <ScrollRow as="ul" className="no-scrollbar flex snap-x snap-mandatory scroll-px-1 gap-3 overflow-x-auto pb-2">
        {list.items.slice(0, 7).map((item, i) => {
          const src = entityPosterUrl(item.entity);
          return (
            <li key={item.id} className="w-[110px] shrink-0 snap-start lg:w-auto lg:flex-1 lg:basis-0">
              <Link href={listHref(list.slug)} className="block">
                <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-[#101330]">
                  {src && <Image src={src} alt="" fill sizes="110px" loading="lazy" className="object-cover" />}
                  <span className="num absolute end-2 top-2 rounded-md bg-[#0b0d1c]/85 px-1.5 text-[11px] font-bold text-ink">#{toFaDigits(i + 1)}</span>
                </div>
                <p className="mt-2 line-clamp-1 text-xs text-[#c4c8e6]">{item.entity.title_fa || item.entity.title}</p>
              </Link>
            </li>
          );
        })}
      </ScrollRow>
    </article>
  );
}
