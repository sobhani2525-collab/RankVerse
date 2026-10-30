"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import ScrollRow from "@/components/ScrollRow";
import { discoverLists, getFeaturedLists } from "@/lib/api";
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
      <h2 className="mb-6 text-2xl font-extrabold text-ink">فهرست‌ها</h2>

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
              tab === t.key ? "border-[#a99bff] bg-[#a99bff] text-[#0b0d1c]" : "border-[#2a2f5c] text-[#c4c8e6] hover:border-[#a99bff]"
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
              <ListCard list={list} />
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
    <article className="grid min-w-0 grid-cols-1 items-center gap-6 rounded-3xl border border-[#2a2f5c] bg-gradient-to-l from-[#1a1d45] to-[#101330] p-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]">
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

function ListCard({ list }: { list: ListSummary }) {
  const posters = list.preview_items.slice(0, 3);
  const hook = list.description?.split(/[.!؟?\n]/)[0]?.trim();
  return (
    <article className="flex h-full flex-col rounded-3xl border border-[#2a2f5c] bg-[#141733] p-4">
      <Link href={listHref(list.slug)} className="block">
        <div className="grid grid-cols-3 gap-2">
          {posters.map((e) => {
            const src = entityPosterUrl(e);
            return (
              <div key={e.id} className="relative aspect-[2/3] overflow-hidden rounded-xl bg-[#101330]">
                {src && <Image src={src} alt="" fill sizes="100px" loading="lazy" className="object-cover" />}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0b0d1c]/90 to-transparent px-1.5 pb-1.5 pt-6 text-[11px] font-bold leading-4 text-ink line-clamp-2">
                  {e.title_fa || e.title}
                </span>
              </div>
            );
          })}
        </div>
        {hook && <p className="mt-3 line-clamp-1 text-xs text-[#5fd8bf]">{hook}</p>}
        <h3 className="mt-1 line-clamp-2 text-base font-extrabold leading-7 text-ink">{list.title}</h3>
        <p className="mt-2 text-xs text-[#a3a8cc]">
          {list.owner_username && <span dir="ltr">@{list.owner_username}</span>}
          {typeof list.item_count === "number" && <> · <span className="num">{toFaDigits(list.item_count)}</span> عنوان</>}
        </p>
      </Link>
      <div className="mt-auto flex items-center justify-between border-t border-dashed border-[#2a2f5c] pt-3 text-xs text-[#a3a8cc]">
        <Link href={listHref(list.slug)} className="inline-flex min-h-11 items-center font-bold text-ink">+ گزینه اضافه کن</Link>
        <span className="num">♡ {toFaDigits(list.like_count)}</span>
      </div>
    </article>
  );
}
