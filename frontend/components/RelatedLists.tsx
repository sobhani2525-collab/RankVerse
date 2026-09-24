import Link from "next/link";
import { getRelatedLists } from "@/lib/api";
import { toFaDigits } from "@/lib/format-number";
import { SectionHeading } from "@/components/list-detail/ui";

/**
 * "Lists in the same orbit" on the list detail page. Every list the
 * backend returns carries its reason (shared items and/or a shared tag);
 * renders nothing when there are none.
 */
export default async function RelatedLists({ slug }: { slug: string }) {
  let related;
  try {
    related = await getRelatedLists(slug);
  } catch {
    return null;
  }

  if (!related.length) return null;

  return (
    <section aria-labelledby="related-lists-heading" className="flex flex-col gap-3 lg:gap-3.5">
      <div id="related-lists-heading">
        <SectionHeading en="RELATED LISTS" fa="لیست‌های هم‌مدار" />
      </div>
      {related.map((list) => (
        <Link
          key={list.id}
          href={`/lists/${list.slug}`}
          className="flex flex-col gap-1 rounded-[14px] border border-border-soft bg-surface px-4 py-3.5 text-ink transition hover:border-border lg:gap-1.5 lg:px-[18px] lg:py-4"
        >
          <span className="text-[15px] font-bold lg:text-base">{list.title}</span>
          <span className="text-xs text-muted lg:text-[13px]">
            {list.shared_item_count > 0 ? (
              <span className="text-gold">{toFaDigits(list.shared_item_count)} عنوان مشترک</span>
            ) : (
              list.shared_tag && <span className="text-teal">تگ مشترک #{list.shared_tag}</span>
            )}
            {list.owner_username && (
              <>
                {" · "}
                <span dir="ltr">@{list.owner_username}</span>
              </>
            )}
          </span>
        </Link>
      ))}
    </section>
  );
}
