import Link from "next/link";
import type { ListSummary } from "@/lib/types";
import { MIN_ITEMS_TO_PUBLISH } from "@/lib/constants";
import { draftListHref, listHref } from "@/lib/list-url";
import { toFaDigits } from "@/lib/format-number";

/** A list the owner hasn't finished: an unpublished draft, or one with
 *  fewer than MIN_ITEMS_TO_PUBLISH items. */
export function isIncompleteList(list: ListSummary): boolean {
  return list.visibility !== "public" || (list.item_count ?? 0) < MIN_ITEMS_TO_PUBLISH;
}

/** Owner-only card on the profile page: progress toward publishing and a
 *  button back into the list's editor (the draft editor for private
 *  drafts, the list page -- where the owner adds items -- once published). */
export default function IncompleteListCard({ list }: { list: ListSummary }) {
  const count = list.item_count ?? 0;
  const isDraft = list.visibility !== "public";
  const short = count < MIN_ITEMS_TO_PUBLISH;
  const href = isDraft ? draftListHref(list.slug) : listHref(list.slug);
  const status = short
    ? `نیمه‌کاره — ${toFaDigits(count)} از ${toFaDigits(MIN_ITEMS_TO_PUBLISH)} آیتم`
    : `آمادهٔ انتشار — ${toFaDigits(count)} آیتم`;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-gold/40 bg-surface/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-[1.7] text-ink">{list.title}</h3>
        <span className="shrink-0 rounded-full border border-border-soft px-2.5 py-0.5 text-[11px] text-dim">
          {isDraft ? "پیش‌نویس خصوصی" : "منتشرشده"}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {Array.from({ length: MIN_ITEMS_TO_PUBLISH }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < count ? "bg-teal" : "bg-border"}`} />
          ))}
        </div>
        <p className={`text-xs font-semibold ${short ? "text-gold" : "text-teal"}`}>{status}</p>
      </div>
      <Link
        href={href}
        className="mt-auto flex h-10 items-center justify-center rounded-xl bg-gold px-4 text-sm font-extrabold text-bg transition hover:bg-gold/90"
      >
        ادامه / تکمیل
      </Link>
    </div>
  );
}
