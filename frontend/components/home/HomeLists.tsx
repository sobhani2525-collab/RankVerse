"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import ScrollRow from "@/components/ScrollRow";
import ListTicketCard from "@/components/lists/list-ticket-card";
import { discoverLists, getFeaturedLists } from "@/lib/api";
import { listSummaryToTicketCard } from "@/lib/entity-card-adapters";
import { entityPosterUrl } from "@/lib/list-constellation";
import { listHref } from "@/lib/list-url";
import { toFaDigits } from "@/lib/format-number";
import { LIST_TABS, ListTab, discoverQueryFor, withoutFeatured } from "@/lib/home-lists";
import type { ListDetail, ListSummary } from "@/lib/types";

type Cache = Partial<Record<ListTab, ListSummary[]>>;

/** The lists section: this week's featured list as a big ranked card, tabs, list cards and a dashed «new list» card. */
export default function HomeLists({ featured, initialPicked }: { featured: ListDetail | null; initialPicked: ListSummary[] }) {
  const [tab, setTab] = useState<ListTab>("foryou");
  const [cache, setCache] = useState<Cache>({ picked: initialPicked });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (cache[tab]) return;
    let cancelled = false;
    setFailed(false);
    const query = discoverQueryFor(tab);
    (query ? discoverLists(query, 0) : getFeaturedLists(6, 0))
      .then((items) => !cancelled && setCache((c) => ({ ...c, [tab]: items })))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [tab, cache]);

  const items = cache[tab];
  const cards = items ? withoutFeatured(items, featured?.slug ?? null, 4) : null;

  return (
    <section className="mx-auto max-w-7xl px-6 py-14" aria-label="فهرست‌ها">
      <h2 className="mb-6 text-2xl font-bold text-ink">فهرست‌ها</h2>

      {featured && featured.items.length > 0 && <FeaturedCard list={featured} />}

      <div role="tablist" aria-label="دسته‌بندی فهرست‌ها" className="mb-6 mt-8 flex gap-2 overflow-x-auto">
        {LIST_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`min-h-11 shrink-0 rounded-full border px-5 text-sm font-semibold focus-visible:outline-gold ${
              tab === t.key ? "border-violet-soft bg-violet-soft text-bg" : "border-border text-ink-dim hover:border-violet-soft"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {failed ? (
        <p role="alert" className="text-sm text-muted">دریافت فهرست‌ها ممکن نشد.</p>
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
            <div key={list.id} className="w-[82%] shrink-0 snap-start md:w-auto">
              <ListTicketCard list={{ ...listSummaryToTicketCard(list), featured: false }} plainPosters />
            </div>
          ))}
          <Link
            href="/lists/new"
            className="flex w-[82%] shrink-0 snap-start min-h-72 md:w-auto flex-col justify-center gap-3 rounded-3xl border border-dashed border-violet-soft/50 p-6 hover:bg-violet/5"
          >
            <span className="text-xs text-violet-soft">فهرست جدید</span>
            <span className="text-lg font-bold text-ink">فهرست خودت را بساز؛ کمتر از دو دقیقه</span>
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
    <article className="rounded-3xl border border-border bg-gradient-to-l from-[#101330] to-[#141733] p-6">
      <p className="text-xs text-gold">فهرست برگزیدهٔ این هفته</p>
      <h3 className="mt-2 text-xl font-bold text-ink">{list.title}</h3>
      <p className="mt-1 text-xs text-muted">
        {list.owner_username && <>ساختهٔ {list.owner_username} · </>}
        <span className="num">{toFaDigits(list.items.length)}</span> عنوان · <span className="num">{toFaDigits(list.like_count)}</span> پسند
      </p>
      <ScrollRow as="ul" className="no-scrollbar mt-5 flex snap-x snap-mandatory scroll-px-1 gap-3 overflow-x-auto pb-2">
        {list.items.slice(0, 7).map((item, i) => {
          const src = entityPosterUrl(item.entity);
          return (
            <li key={item.id} className="w-[110px] shrink-0 snap-start">
              <Link href={listHref(list.slug)} className="block">
                <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface2">
                  {src && <Image src={src} alt="" fill sizes="110px" loading="lazy" className="object-cover" />}
                  <span className="num absolute end-2 top-2 rounded-md bg-bg/80 px-1.5 text-[11px] font-bold text-ink">#{toFaDigits(i + 1)}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ScrollRow>
      <Link href={listHref(list.slug)} className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-gradient-to-l from-violet-soft to-teal px-5 text-sm font-bold text-bg">
        مشاهدهٔ فهرست کامل
      </Link>
    </article>
  );
}
