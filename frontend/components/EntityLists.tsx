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
      <div className="rounded-2xl border border-border-soft bg-surface/40 p-5">
        <SectionHeading en="IN LISTS" fa={`در ${toFaDigits(lists.length)} لیست کاربران`} />
        <div className="mt-4 flex flex-col gap-3">
          {shown.map((list) => (
            <Link
              key={list.id}
              href={`/lists/${list.slug}`}
              className="flex flex-col gap-0.5 rounded-xl border border-border-soft bg-surface p-3 transition hover:border-teal/40"
            >
              <span className="truncate text-sm font-bold text-ink">{list.title}</span>
              {list.owner_username && (
                <span dir="ltr" className="text-xs text-muted">
                  @{list.owner_username}
                </span>
              )}
            </Link>
          ))}
        </div>
        <Link href="/lists" className="mt-3 flex min-h-[32px] items-center text-xs text-violet-light hover:text-ink">
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
