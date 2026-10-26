import Link from "next/link";
import { SectionHeading } from "@/components/list-detail/ui";
import { toFaDigits } from "@/lib/format-number";
import { Award } from "@/lib/types";

/**
 * "جوایز" -- wins and nominations grouped by award (the API already orders
 * them: award order, wins first, newest year first). Renders nothing for a
 * page without awards.
 */
export default function AwardsSection({ awards, tone }: { awards?: Award[]; tone?: string }) {
  if (!awards || awards.length === 0) return null;

  const groups = new Map<string, Award[]>();
  for (const a of awards) groups.set(a.award, [...(groups.get(a.award) ?? []), a]);

  return (
    <div>
      <SectionHeading en="AWARDS" fa="جوایز" tone={tone} />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {[...groups.values()].map((items) => {
          const wins = items.filter((a) => a.status === "won").length;
          return (
            <section key={items[0].award} className="rounded-xl border border-white/10 p-4">
              <h3 className="flex items-baseline justify-between gap-2 text-sm font-semibold">
                <span>{items[0].award_name_fa}</span>
                <span className="text-xs font-normal text-dim">
                  {toFaDigits(wins)} برد · {toFaDigits(items.length - wins)} نامزدی
                </span>
              </h3>
              <ul className="mt-3 space-y-1.5 text-sm">
                {items.map((a, i) => (
                  <li key={i} className={a.status === "won" ? "text-gold" : "text-dim"}>
                    <span>{a.status === "won" ? "🏆 " : ""}{a.category_fa ?? a.category}</span>
                    <span className="text-xs"> · {toFaDigits(a.year)}</span>
                    {a.for_title && a.for_slug && (
                      <Link href={`/movies/${a.for_slug}`} className="text-xs hover:text-ink">
                        {" "}— {a.for_title}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
