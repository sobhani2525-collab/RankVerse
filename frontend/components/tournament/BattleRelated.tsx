import Link from "next/link";
import { getBattleRelated } from "@/lib/tournament-server";
import { displayTitle } from "@/lib/title";
import { listHref } from "@/lib/list-url";
import { toFaDigits } from "@/lib/format-number";
import { ENTITY_TYPE_LABELS, tournamentHref } from "@/lib/tournament";
import { SectionHeading } from "@/components/list-detail/ui";

const ROW =
  "flex flex-col gap-1 rounded-[14px] border border-border-soft bg-surface px-4 py-3.5 text-ink transition hover:border-border lg:gap-1.5 lg:px-[18px] lg:py-4";

/**
 * Under a battle: other public battles and lists it shares entries with (for a
 * finished tournament: the ones its winner is in). Same quiet row style as the
 * list page's "related lists". Renders nothing when there is nothing related.
 */
export default async function BattleRelated({ slug }: { slug: string }) {
  const related = await getBattleRelated(slug);
  if (!related || (related.battles.length === 0 && related.lists.length === 0)) return null;
  const name = related.winner ? displayTitle(related.winner) : null;

  return (
    <div className="mx-auto max-w-5xl px-6 pb-16">
      <div className="border-t border-border pt-10">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
          {related.battles.length > 0 && (
            <section aria-labelledby="related-battles-heading" className="flex flex-col gap-3 lg:gap-3.5">
              <div id="related-battles-heading">
                <SectionHeading en="RELATED BATTLES" fa={name ? `نبردهای دیگرِ «${name}»` : "نبردهای هم‌مدار"} />
              </div>
              {related.battles.map((b) => (
                <Link key={b.slug} href={tournamentHref(b.slug)} className={ROW}>
                  <span className="text-[15px] font-bold lg:text-base">{b.title}</span>
                  <span className="text-xs text-muted lg:text-[13px]">
                    {b.shared_count ? (
                      <span className="text-gold">{toFaDigits(b.shared_count)} گزینهٔ مشترک</span>
                    ) : (
                      <span>{ENTITY_TYPE_LABELS[b.entity_type]}</span>
                    )}
                    {" · "}
                    <span>{toFaDigits(b.bracket_size)} گزینه</span>
                  </span>
                </Link>
              ))}
            </section>
          )}

          {related.lists.length > 0 && (
            <section aria-labelledby="related-battle-lists-heading" className="flex flex-col gap-3 lg:gap-3.5">
              <div id="related-battle-lists-heading">
                <SectionHeading en="RELATED LISTS" fa={name ? `فهرست‌هایی که «${name}» در آن‌هاست` : "فهرست‌های هم‌مدار"} />
              </div>
              {related.lists.map((list) => (
                <Link key={list.id} href={listHref(list.slug)} className={ROW}>
                  <span className="text-[15px] font-bold lg:text-base">{list.title}</span>
                  <span className="text-xs text-muted lg:text-[13px]">
                    {list.shared_item_count ? (
                      <span className="text-gold">{toFaDigits(list.shared_item_count)} عنوان مشترک</span>
                    ) : (
                      <span className="text-gold">{toFaDigits(list.like_count)} پسند</span>
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
          )}
        </div>
      </div>
    </div>
  );
}
