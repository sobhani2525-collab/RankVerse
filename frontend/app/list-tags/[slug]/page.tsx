import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import ListTicketGrid from "@/components/lists/list-ticket-grid";
import { discoverListsPage, LISTS_CACHE_TAG, LISTS_PAGE_SIZE } from "@/lib/api";
import { toFaDigits } from "@/lib/format-number";
import { listTagHref, listTagPageNumber, listTagSlug } from "@/lib/list-tag-href";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

function tagSlugFromSegment(segment: string): string {
  return segment.startsWith("~") ? segment.slice(1) : segment;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tag = tagSlugFromSegment((await params).slug);
  return {
    title: typeof tag === "string" && tag.trim() ? `فهرست‌های تگ «${tag}»` : "تگ‌های فهرست‌ها",
    robots: { index: false, follow: true },
  };
}

const linkStyle = "inline-flex min-h-[44px] items-center rounded-full border border-border px-4 text-sm font-bold text-muted transition hover:border-gold/40 hover:text-gold";

export default async function ListTagPage({ params, searchParams }: Props) {
  const slug = tagSlugFromSegment((await params).slug);
  if (!slug) redirect("/lists");
  const page = listTagPageNumber((await searchParams).page);
  const { items, total } = await discoverListsPage(
    { tag_slug: slug, page, page_size: LISTS_PAGE_SIZE, sort: "newest" },
    undefined,
    [LISTS_CACHE_TAG],
  );
  const tag = items[0]?.tags.find((value) => listTagSlug(value) === slug) ?? slug;

  if (page > 1 && items.length === 0) redirect(listTagHref(tag));
  const hasNext = total === null ? items.length === LISTS_PAGE_SIZE : page * LISTS_PAGE_SIZE < total;

  return (
    <main dir="rtl" className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
      <Link href="/lists" className={linkStyle}>همهٔ فهرست‌ها</Link>
      <header className="my-6 border-b border-border-soft pb-6">
        <h1 className="break-words text-2xl font-black text-ink md:text-4xl">
          فهرست‌ها با تگ <bdi className="text-violet-light">#{tag}</bdi>
        </h1>
        {total !== null && <p className="mt-3 text-sm text-muted">{toFaDigits(total)} فهرست</p>}
      </header>

      {items.length ? (
        <ListTicketGrid lists={items} />
      ) : (
        <p className="rounded-xl border border-border bg-surface-2 px-4 py-8 text-center text-muted">
          فهرستی با این تگ پیدا نشد.
        </p>
      )}

      {(page > 1 || hasNext) && (
        <nav aria-label="صفحه‌بندی فهرست‌ها" className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {page > 1 && <Link href={listTagHref(tag, page - 1)} className={linkStyle}>صفحهٔ قبل</Link>}
          <span className="text-sm text-muted">صفحهٔ {toFaDigits(page)}</span>
          {hasNext && <Link href={listTagHref(tag, page + 1)} className={linkStyle}>صفحهٔ بعد</Link>}
        </nav>
      )}
    </main>
  );
}
