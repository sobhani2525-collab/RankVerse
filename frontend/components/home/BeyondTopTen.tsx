import Link from "next/link";
import Image from "next/image";
import SectionHeading from "./SectionHeading";
import { HomeTitle } from "@/lib/home-data";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { detailPathFor } from "@/lib/entity-routes";

// Vertical offsets give the strip an orbit-like wave instead of a flat grid row.
const OFFSETS = ["mt-0", "mt-10", "mt-4", "mt-14", "mt-2", "mt-8"];

export default function BeyondTopTen({ titles }: { titles: HomeTitle[] }) {
  if (titles.length === 0) return null;
  const first = titles[0].rank;
  const last = titles[titles.length - 1].rank;

  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeading
          kicker="Beyond the top 10"
          title="فراتر از ده‌تای اول."
          lead={`ستاره‌های رتبهٔ ${toFaDigits(first)} تا ${toFaDigits(last)} — کمتر دیده‌شده، نه کم‌نورتر.`}
          action={
            <Link href="/rankings" className="text-sm text-gold hover:underline">
              ادامهٔ رتبه‌بندی ←
            </Link>
          }
        />
      </div>

      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[45%] h-px bg-gradient-to-l from-transparent via-white/10 to-transparent" />
        <ul className="no-scrollbar mx-auto flex max-w-7xl snap-x snap-mandatory gap-5 overflow-x-auto px-6 pb-16 pt-2">
          {titles.map((t, i) => (
            <li key={t.id} className={`w-40 shrink-0 snap-start sm:w-44 ${OFFSETS[i % OFFSETS.length]}`}>
              <Link
                href={detailPathFor(t.entity_type, t.slug) ?? `/movies/${t.slug}`}
                className="group block transition duration-500 hover:-translate-y-2 focus-visible:-translate-y-2"
              >
                <span className="relative block aspect-[2/3] overflow-hidden rounded-2xl border border-white/10 bg-surface2 shadow-xl shadow-black/40 transition duration-500 group-hover:border-gold/40 group-hover:shadow-[0_20px_50px_-15px_rgba(145,99,245,0.45)]">
                  {t.posterUrl ? (
                    <Image src={t.posterUrl} alt="" fill sizes="176px" className="object-cover transition duration-700 group-hover:scale-105" />
                  ) : (
                    <span className="absolute inset-0 bg-gradient-brand opacity-30" />
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-[#05070D]/90 via-transparent to-transparent opacity-70 transition group-hover:opacity-100" />
                  <span className="num absolute right-3 top-3 rounded-full bg-[#05070D]/80 px-2 py-0.5 text-xs text-muted backdrop-blur">
                    #{toFaDigits(t.rank)}
                  </span>
                  <span className="absolute inset-x-3 bottom-3 translate-y-2 text-[11px] text-muted opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
                    {t.year && <span className="num">{toFaDigits(t.year)}</span>}
                    {t.year && " · "}
                    <span className="num">{toFaDigits(t.votes)}</span> رأی
                  </span>
                </span>
                <span className="mt-3 block line-clamp-2 text-sm leading-6 text-ink">{displayTitle(t)}</span>
                {t.score !== null && <span className="num text-xs text-gold/80">{toFaDigits(t.score.toFixed(1))}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
