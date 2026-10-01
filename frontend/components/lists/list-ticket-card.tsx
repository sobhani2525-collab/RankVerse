import Image from "next/image";
import Link from "next/link";
import { entityTypeLabel } from "@/lib/constants";
import { toFaDigits } from "@/lib/format-number";

export interface TicketCardPoster {
  id: string;
  title: string;
  posterUrl?: string | null;
}

export interface TicketCardList {
  slug: string;
  title: string;
  description?: string | null;
  entityType?: string | null;
  /** Items in rank order; only the first 5 are drawn. */
  posters: TicketCardPoster[];
  username?: string | null;
  likeCount: number;
  commentCount: number;
  saveCount: number;
}

const SLOTS = 5;
const NAME_SHADOW = { textShadow: "0 1px 3px rgba(0,0,0,.95), 0 0 8px rgba(0,0,0,.7)" } as const;

/** "Cinema ticket" list card: poster collage on top, a torn-ticket
 *  perforation, then the list's text and stats. The whole card is one link,
 *  so nothing inside is interactive. */
export default function ListTicketCard({ list }: { list: TicketCardList }) {
  const typeLabel = list.entityType ? entityTypeLabel(list.entityType) : null;

  return (
    <Link
      href={`/lists/${list.slug}`}
      className="group block overflow-hidden rounded-[20px] bg-[#151A30] transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(0,0,0,.5)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div
        className="grid h-[250px] gap-2 px-4 pb-[10px] pt-4"
        style={{ gridTemplateColumns: "2fr 1fr 1fr", gridTemplateRows: "1fr 1fr" }}
      >
        {Array.from({ length: SLOTS }).map((_, i) => {
          const poster = list.posters[i];
          const first = i === 0;
          return (
            <div
              key={poster?.id ?? `empty-${i}`}
              className={`relative overflow-hidden rounded-[10px] border ${
                first ? "row-span-2 border-[#E8B34A]" : "border-[#2A3150]"
              } ${poster ? "bg-[#1A2036]" : "bg-[#0F1424]"}`}
            >
              {poster && (
                <>
                  {poster.posterUrl && (
                    <Image
                      src={poster.posterUrl}
                      alt={poster.title}
                      fill
                      sizes={first ? "(max-width: 768px) 50vw, 20vw" : "(max-width: 768px) 25vw, 10vw"}
                      className="object-cover"
                    />
                  )}
                  <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 to-transparent" />
                  <span
                    className={`absolute right-2 top-1 font-display leading-none ${
                      first ? "text-[30px] text-[#E8B34A]" : "text-[18px] text-white"
                    }`}
                    style={NAME_SHADOW}
                  >
                    <span className="num">{toFaDigits(i + 1)}</span>
                  </span>
                  <span
                    className={`absolute inset-x-1.5 bottom-1.5 truncate font-bold text-white ${
                      first ? "text-[12px]" : "text-[10px]"
                    }`}
                    style={NAME_SHADOW}
                  >
                    {poster.title}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Tear line: the notches are page-colored circles half outside the card. */}
      <div aria-hidden className="relative h-[22px]">
        <span className="absolute -left-3 top-[-1px] h-6 w-6 rounded-full bg-[#0B0F1A]" />
        <span className="absolute -right-3 top-[-1px] h-6 w-6 rounded-full bg-[#0B0F1A]" />
        <span className="absolute inset-x-[22px] top-1/2 -translate-y-px border-t-2 border-dashed border-[#2A3150]" />
      </div>

      <div className="px-[22px] pb-5 pt-5">
        {typeLabel && (
          <div className="mb-2">
            <span className="inline-block rounded-full border border-[#E8B34A]/30 bg-[#E8B34A]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#E8B34A]">
              {typeLabel}
            </span>
          </div>
        )}
        <h3 className="text-[19px] font-extrabold leading-snug text-[#F2F0E8]">{list.title}</h3>
        {list.description && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-[#8A93A6]">{list.description}</p>
        )}

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#1B2138] pt-3.5">
          {list.username ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-brand text-xs font-bold text-[#0B0F1A]">
                {list.username.charAt(0).toUpperCase()}
              </span>
              <span dir="ltr" className="truncate text-xs text-[#C7CCE0]">
                @{list.username}
              </span>
            </span>
          ) : (
            <span />
          )}
          <span className="flex shrink-0 items-center gap-3 text-[12px] text-[#8A93A6]">
            <Stat count={list.likeCount} label="پسند">
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
            </Stat>
            <Stat count={list.commentCount} label="دیدگاه">
              <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.6-.8L3 21l1.9-5.4A8.4 8.4 0 1 1 21 11.5z" />
            </Stat>
            <Stat count={list.saveCount} label="ذخیره">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </Stat>
          </span>
        </div>
      </div>
    </Link>
  );
}

function Stat({ count, label, children }: { count: number; label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1" title={label}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
      <span className="num">{toFaDigits(count)}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
