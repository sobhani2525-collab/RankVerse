import { listHref } from "@/lib/list-url";
import Link from "next/link";
import { getListsContainingEntity } from "@/lib/api";
import ListCard from "@/components/lists/list-card";
import { listSummaryToListCard } from "@/lib/entity-card-adapters";
import { SectionHeading } from "@/components/list-detail/ui";
import { toFaDigits } from "@/lib/format-number";

export default async function EntityLists({
  entityId,
  variant = "grid",
}: {
  entityId: string;
  /** "sidebar" = the movie/tv-series page's condensed "IN LISTS" module (up
   *  to 2 rows + a "همه لیست‌ها" link), for the 380px column next to the
   *  GRAPH section. "grid" (default) is the wide poster-collage layout used
   *  everywhere else (person/genre/track pages). */
  variant?: "grid" | "sidebar";
}) {
  let lists;
  try {
    lists = await getListsContainingEntity(entityId);
  } catch {
    return null;
  }

  if (!lists.length) return null;

  if (variant === "sidebar") {
    const shown = lists.slice(0, 2);
    return (
      <div>
        <SectionHeading en="IN LISTS" fa={`در ${toFaDigits(lists.length)} لیست کاربران`} />
        <div className="mt-2 flex flex-col">
          {shown.map((list, i) => (
            <Link
              key={list.id}
              href={listHref(list.slug)}
              className={`group flex items-center gap-4 py-4 transition hover:opacity-80 ${i > 0 ? "border-t border-border-soft" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-ink">{list.title}</p>
                {list.owner_username && (
                  <p dir="ltr" className="mt-0.5 text-xs text-muted">
                    @{list.owner_username}
                  </p>
                )}
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-dim transition group-hover:text-gold">
                <path d="m15 6-6 6 6 6" />
              </svg>
            </Link>
          ))}
        </div>
        <Link href="/lists" className="mt-2 flex min-h-[32px] items-center text-xs text-violet-light hover:text-ink">
          همه لیست‌ها ←
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-10">
      <h2 className="text-lg font-bold text-ink">لیست‌های مرتبط</h2>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
        {lists.map((list) => (
          <ListCard key={list.id} list={listSummaryToListCard(list)} />
        ))}
      </div>
    </div>
  );
}
