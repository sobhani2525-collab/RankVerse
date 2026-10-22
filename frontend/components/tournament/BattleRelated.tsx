import Link from "next/link";
import { getBattleRelated } from "@/lib/tournament-server";
import { displayTitle } from "@/lib/title";
import { listHref } from "@/lib/list-url";
import { toFaDigits } from "@/lib/format-number";
import { SectionHeading } from "@/components/list-detail/ui";
import TournamentCard from "./TournamentCard";

const ROW =
  "flex flex-col gap-1 rounded-[14px] border border-border-soft bg-surface px-4 py-3.5 text-ink transition hover:border-border lg:gap-1.5 lg:px-[18px] lg:py-4";

/**
 * Under a battle: one centred column, as wide as the battle above it, with a divider. Related
 * battles come first (as the same fight cards as the /battles page, two per row), then related
 * lists in the list page's quiet row style. A section with nothing in it is left out, and so is
 * the whole block when there is nothing related. For a finished tournament both are "the ones
 * its winner is in".
 */
export default async function BattleRelated({ slug }: { slug: string }) {
  const related = await getBattleRelated(slug);
  if (!related || (related.battles.length === 0 && related.lists.length === 0)) return null;
  const name = related.winner ? displayTitle(related.winner) : null;

  return (
    <div className="mx-auto max-w-3xl px-6 pb-16">
      <div className="flex flex-col gap-12 border-t border-border pt-10">
        {related.battles.length > 0 && (
          <section aria-labelledby="related-battles-heading" className="flex flex-col gap-4">
            <div id="related-battles-heading">
              <SectionHeading en="RELATED BATTLES" fa={name ? `نبردهای دیگرِ «${name}»` : "نبردهای هم‌مدار"} />
            </div>
            {/* a lone card is centred instead of hugging one side of a two-column grid */}
            <div className={related.battles.length === 1 ? "mx-auto w-full max-w-sm" : "grid gap-4 sm:grid-cols-2"}>
              {related.battles.slice(0, 4).map((b) => (
                <TournamentCard key={b.slug} battle={b} />
              ))}
            </div>
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
  );
}
