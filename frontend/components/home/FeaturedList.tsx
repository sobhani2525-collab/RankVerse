import { listHref } from "@/lib/list-url";
import Link from "next/link";
import Image from "next/image";
import SectionHeading from "./SectionHeading";
import { ListDetail } from "@/lib/types";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { entityPosterUrl } from "@/lib/list-constellation";

// Vertical offsets give the strip an orbit-like wave instead of a flat grid row.
const OFFSETS = ["mt-0", "mt-10", "mt-4", "mt-14", "mt-2", "mt-8"];

export default function FeaturedList({ list }: { list: ListDetail }) {
  if (list.items.length === 0) return null;

  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          kicker="Featured list"
          title={list.title}
          lead={`برگزیده از میان لیست‌های کاربران${list.owner_username ? ` — ساخته‌شده توسط ${list.owner_username}` : ""}`}
          action={
            <Link href={listHref(list.slug)} className="text-sm text-gold hover:underline">
              مشاهدهٔ لیست کامل ←
            </Link>
          }
        />
      </div>

      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[45%] h-px bg-gradient-to-l from-transparent via-white/10 to-transparent" />
        <ul className="no-scrollbar mx-auto flex max-w-7xl snap-x snap-mandatory gap-5 overflow-x-auto px-6 pb-16 pt-2">
          {list.items.map((item, i) => {
            const posterUrl = entityPosterUrl(item.entity);
            const card = (
              <>
                <span className="relative block aspect-[2/3] overflow-hidden rounded-2xl border border-white/10 bg-surface2 shadow-xl shadow-black/40 transition duration-500 group-hover:border-gold/40 group-hover:shadow-[0_20px_50px_-15px_rgba(145,99,245,0.45)]">
                  {posterUrl ? (
                    <Image src={posterUrl} alt="" fill sizes="176px" className="object-cover transition duration-700 group-hover:scale-105" />
                  ) : (
                    <span className="absolute inset-0 bg-gradient-brand opacity-30" />
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-[#05070D]/90 via-transparent to-transparent opacity-70 transition group-hover:opacity-100" />
                  <span className="num absolute right-3 top-3 rounded-full bg-[#05070D]/80 px-2 py-0.5 text-xs text-muted backdrop-blur">
                    #{toFaDigits(item.position)}
                  </span>
                </span>
                <span className="mt-3 block line-clamp-2 text-sm leading-6 text-ink">{displayTitle(item.entity)}</span>
                {item.composite_score != null && <span className="num text-xs text-gold/80">{toFaDigits(item.composite_score.toFixed(1))}</span>}
              </>
            );
            return (
              <li key={item.id} className={`w-40 shrink-0 snap-start sm:w-44 ${OFFSETS[i % OFFSETS.length]}`}>
                <Link href={listHref(list.slug)} className="group block transition duration-500 hover:-translate-y-2 focus-visible:-translate-y-2">
                  {card}
                </Link>
              </li>
            );
          })}
          <li className={`w-40 shrink-0 snap-start sm:w-44 ${OFFSETS[list.items.length % OFFSETS.length]}`}>
            <Link href={listHref(list.slug)} className="group block transition duration-500 hover:-translate-y-2 focus-visible:-translate-y-2">
              <span className="relative flex aspect-[2/3] flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-white/15 bg-surface2/40 text-center transition duration-500 group-hover:border-gold/40 group-hover:bg-surface2/70">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-lg text-muted transition group-hover:border-gold/40 group-hover:text-gold">
                  +
                </span>
                <span className="px-3 text-xs leading-5 text-muted transition group-hover:text-ink">افزودن گزینهٔ دلخواه من</span>
              </span>
            </Link>
          </li>
        </ul>
      </div>
    </section>
  );
}
