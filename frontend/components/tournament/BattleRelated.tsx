import Link from "next/link";
import { getBattleRelated } from "@/lib/tournament-server";
import { displayTitle } from "@/lib/title";
import { listHref } from "@/lib/list-url";
import { toFaDigits } from "@/lib/format-number";
import { SectionHeading } from "@/components/list-detail/ui";
import TournamentCard from "./TournamentCard";

/**
 * After a battle ends: other public battles the champion fights in, and public
 * lists that include it (most liked first). Renders nothing while the battle
 * is still running or when there is nothing related.
 */
export default async function BattleRelated({ slug }: { slug: string }) {
  const related = await getBattleRelated(slug);
  if (!related?.winner || (related.battles.length === 0 && related.lists.length === 0)) return null;
  const name = displayTitle(related.winner);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-10 px-6 pb-16">
      {related.battles.length > 0 && (
        <section aria-labelledby="related-battles-heading">
          <div id="related-battles-heading">
            <SectionHeading en="RELATED BATTLES" fa={`نبردهای دیگرِ «${name}»`} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.battles.map((b) => (
              <TournamentCard key={b.slug} battle={b} />
            ))}
          </div>
        </section>
      )}

      {related.lists.length > 0 && (
        <section aria-labelledby="related-battle-lists-heading">
          <div id="related-battle-lists-heading">
            <SectionHeading en="RELATED LISTS" fa={`فهرست‌هایی که «${name}» در آن‌هاست`} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {related.lists.map((list) => (
              <Link
                key={list.id}
                href={listHref(list.slug)}
                className="flex flex-col gap-1.5 rounded-[14px] border border-border-soft bg-surface px-4 py-3.5 text-ink transition hover:border-border"
              >
                <span className="text-[15px] font-bold">{list.title}</span>
                <span className="text-xs text-muted">
                  <span className="text-gold">{toFaDigits(list.like_count)} پسند</span>
                  {list.owner_username && (
                    <>
                      {" · "}
                      <span dir="ltr">@{list.owner_username}</span>
                    </>
                  )}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
