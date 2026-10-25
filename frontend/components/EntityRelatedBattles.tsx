import Link from "next/link";
import { getBattlesWithEntity } from "@/lib/tournament-server";
import { TournamentEntity, posterSrc, tournamentHref } from "@/lib/tournament";
import { toFaDigits } from "@/lib/format-number";
import { SectionHeading } from "@/components/list-detail/ui";
import { displayTitle } from "@/lib/title";

/**
 * Sidebar module under NOTABLE RANKINGS on a movie / series page: the public
 * battles this title is an entry of, in the same quiet row style as the
 * rankings above it (two crossed entry posters, the battle's name, how many
 * played). With none yet, an invitation to start one.
 */
export default async function EntityRelatedBattles({ entityId, entityType }: { entityId: string; entityType: "movie" | "tv_series" }) {
  const battles = await getBattlesWithEntity(entityId);
  const typeFa = entityType === "tv_series" ? "سریال" : "فیلم";

  return (
    <div>
      <SectionHeading en="RELATED BATTLES" fa="نبردهای مرتبط" tone="text-gold" />
      {battles.length === 0 ? (
        <Link
          href="/battles/new"
          className="group mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-gold/30 px-4 py-4 text-sm text-muted transition hover:border-gold/60 hover:bg-gold/5 hover:text-ink"
        >
          <span className="min-w-0 flex-1 leading-6">هنوز نبردی با این {typeFa} ساخته نشده؛ اولین نبرد را تو بساز.</span>
          <span className="shrink-0 text-gold transition group-hover:-translate-x-0.5">←</span>
        </Link>
      ) : (
        <div className="mt-2 flex flex-col">
          {battles.map((b, i) => {
            const [x, y] = b.preview ?? [];
            return (
              <Link
                key={b.slug}
                href={tournamentHref(b.slug)}
                className={`group flex items-center gap-4 rounded-xl px-2 py-3.5 transition hover:bg-white/[0.03] ${i > 0 ? "border-t border-border-soft" : ""}`}
              >
                {/* two of its entries, fanned like a pair of cards */}
                <span className="relative h-[60px] w-[64px] shrink-0" aria-hidden="true">
                  {y && <Thumb entity={y} className="left-0 top-1 -rotate-[8deg] group-hover:-rotate-[12deg]" />}
                  {x && <Thumb entity={x} className="right-0 top-0 rotate-[6deg] group-hover:rotate-[10deg]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-[15px] font-bold leading-6 text-ink transition-colors group-hover:text-gold">{b.title}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                    {b.status === "active" && (
                      <span className="flex items-center gap-1 text-teal">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />
                        در جریان
                      </span>
                    )}
                    <span>
                      <span className="num">{toFaDigits(b.players_count ?? 0)}</span> بازیکن
                    </span>
                  </span>
                </span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-dim transition group-hover:text-gold">
                  <path d="m15 6-6 6 6 6" />
                </svg>
              </Link>
            );
          })}
          <Link href="/battles" className="mt-2 flex min-h-[32px] items-center text-xs text-violet-light hover:text-ink">
            همه نبردها ←
          </Link>
        </div>
      )}
    </div>
  );
}

function Thumb({ entity, className }: { entity: TournamentEntity; className: string }) {
  const src = posterSrc(entity, "w185");
  return (
    <span
      className={`absolute block h-[54px] w-9 overflow-hidden rounded-md bg-surface2 shadow-[0_4px_12px_rgba(0,0,0,0.6)] ring-1 ring-white/15 transition duration-300 ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={displayTitle(entity)} loading="lazy" className="h-full w-full object-cover" />
      ) : null}
    </span>
  );
}
