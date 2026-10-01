import Link from "next/link";
import type { ListSummary } from "@/lib/types";
import { TAG_CHIP } from "@/lib/list-constellation";
import { Chip, MonoLabel } from "@/components/list-detail/ui";
import { StatRow } from "./constellation-list-card";
import ListSky from "./list-sky";

/** The most-followed list, shown large above the grid. */
export default function FeaturedList({ list }: { list: ListSummary }) {
  const href = `/lists/${list.slug}`;
  return (
    <section className="group relative mb-12 grid overflow-hidden rounded-3xl border border-gold/25 bg-surface lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col items-start gap-4 p-6 md:p-10">
        <div className="flex items-center gap-2.5">
          <span className="h-[7px] w-[7px] rounded-full bg-gold shadow-[0_0_0_3px_rgba(232,179,74,0.18)]" aria-hidden="true" />
          <MonoLabel className="text-gold">BRIGHTEST STAR</MonoLabel>
          <span className="text-xs text-muted">درخشان‌ترین لیست</span>
        </div>
        <Link href={href} className="font-display text-3xl leading-tight text-ink transition hover:text-gold md:text-4xl">
          {list.title}
        </Link>
        {list.description && (
          <p className="line-clamp-3 max-w-xl text-sm leading-[2] text-ink-dim md:text-base">{list.description}</p>
        )}
        {list.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {list.tags.slice(0, 4).map((tag) => (
              <Chip key={tag} href={`/lists?tag=${encodeURIComponent(tag)}`} tone={TAG_CHIP} className="hover:border-teal/50 hover:text-teal">
                #{tag}
              </Chip>
            ))}
          </div>
        )}
        <StatRow list={list} />
        <Link href={href} className="btn-primary mt-2 text-sm hover:opacity-90">
          ورود به صورت فلکی
        </Link>
      </div>
      <Link href={href} aria-label={list.title} className="block border-t border-gold/15 lg:border-r lg:border-t-0">
        <ListSky items={list.preview_items} heightClass="h-56 lg:h-full lg:min-h-[320px]" tileClass="w-[96px] md:w-[116px]" />
      </Link>
    </section>
  );
}
