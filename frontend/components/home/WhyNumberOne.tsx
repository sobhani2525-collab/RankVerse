import Link from "next/link";
import Image from "next/image";
import SectionHeading from "./SectionHeading";
import Reveal from "./Reveal";
import { HomeTitle } from "@/lib/home-data";
import { RankingHighlight } from "@/lib/api";
import { displayTitle } from "@/lib/title";
import { genreLabel } from "@/lib/genre-labels";
import { toFaDigits } from "@/lib/format-number";

function groupLabel(h: RankingHighlight): string {
  if (h.dimension === "genre") return `در ژانر ${genreLabel(h.group.title)}`;
  if (h.dimension === "director") return `میان فیلم‌های ${h.group.title}`;
  if (h.dimension === "creator") return `میان سریال‌های ${h.group.title}`;
  return `در ${h.group.title}`;
}

function groupHref(h: RankingHighlight): string {
  return h.dimension === "genre" ? `/genre/${h.group.slug}` : `/person/${h.group.slug}`;
}

/**
 * Explains the #1 spot using only what the API actually exposes: the
 * composite score against its closest rivals, the community vote count,
 * and where the title ranks inside each automatic ranking group
 * (/movies/{slug}/rankings). The per-component split (user vs. external
 * score) is computed server-side but not returned, so it is described in
 * words, never drawn as numbers.
 */
export default function WhyNumberOne({
  leader,
  rivals,
  highlights,
}: {
  leader: HomeTitle;
  rivals: HomeTitle[];
  highlights: RankingHighlight[];
}) {
  const podium = [leader, ...rivals].filter((t) => t.score !== null).slice(0, 5);
  const top = leader.score ?? 0;
  const tiedWith = rivals.filter((r) => r.score !== null && r.score === leader.score);
  const runnerUp = rivals.find((r) => r.score !== null);
  const gap = leader.score !== null && runnerUp?.score != null ? leader.score - runnerUp.score : null;

  return (
    <section className="relative border-y border-border/60 bg-[#080B14]/70">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <SectionHeading kicker="Why is it #1?" title="چرا اول است؟" lead="هر رتبه دلیلی دارد. این‌ها داده‌هایی است که جایگاه فعلی را ساخته‌اند." />

        <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-14">
          <Reveal>
            <Link href={`/movies/${leader.slug}`} className="group relative block overflow-hidden rounded-3xl border border-gold/20 bg-surface/40">
              <div className="relative aspect-[4/5] w-full">
                {leader.posterUrl ? (
                  <Image src={leader.posterUrl} alt={displayTitle(leader)} fill sizes="(max-width: 1024px) 90vw, 420px" className="object-cover transition duration-700 group-hover:scale-105" />
                ) : (
                  <span className="absolute inset-0 bg-gradient-brand opacity-30" />
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-[#05070D] via-[#05070D]/40 to-transparent" />
              </div>
              <div className="absolute inset-x-0 bottom-0 p-6">
                <p className="num text-7xl font-bold leading-none text-gold">#{toFaDigits(1)}</p>
                <p className="mt-3 text-xl font-medium text-ink">{displayTitle(leader)}</p>
                {leader.score !== null && (
                  <p className="mt-1 text-sm text-muted">
                    امتیاز ترکیبی <span className="num text-ink">{toFaDigits(leader.score.toFixed(2))}</span>
                  </p>
                )}
              </div>
            </Link>
          </Reveal>

          <div className="flex flex-col gap-10">
            {podium.length > 1 && (
              <Reveal delay={100}>
                <h3 className="kicker text-muted/80">Composite score vs. rivals</h3>
                <p className="mt-1 text-sm text-muted">
                  {tiedWith.length > 0
                    ? `هم‌امتیاز با ${toFaDigits(tiedWith.length)} عنوان دیگر — فاصله‌ای در صدر نیست.`
                    : gap !== null
                    ? `فاصله با رتبهٔ دوم: ${toFaDigits(gap.toFixed(2))} امتیاز`
                    : "مقایسه با نزدیک‌ترین رقیب‌ها"}
                </p>
                <ul className="mt-4 space-y-3">
                  {podium.map((t) => (
                    <li key={t.id} className="grid grid-cols-[2.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm">
                      <span className={`num text-center ${t.rank === 1 ? "text-gold" : "text-muted"}`}>#{toFaDigits(t.rank)}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs text-ink-dim">{displayTitle(t)}</span>
                        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/5">
                          <span
                            className={`block h-full rounded-full ${t.rank === 1 ? "bg-gradient-to-l from-gold to-violet" : "bg-white/20"}`}
                            style={{ width: `${top > 0 && t.score !== null ? (t.score / top) * 100 : 0}%` }}
                          />
                        </span>
                      </span>
                      <span className="num text-left text-ink">{toFaDigits(t.score!.toFixed(2))}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}

            {highlights.length > 0 && (
              <Reveal delay={200}>
                <h3 className="kicker text-muted/80">Rank inside its groups</h3>
                <p className="mt-1 text-sm text-muted">جایگاه همین عنوان در هر گروه خودکار رتبه‌بندی</p>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {highlights.slice(0, 4).map((h) => {
                    const pct = Math.max(3, ((h.group_size - h.rank + 1) / h.group_size) * 100);
                    return (
                      <li key={`${h.dimension}-${h.group.id}`}>
                        <Link href={groupHref(h)} className="block rounded-2xl border border-white/5 bg-surface/40 p-4 transition hover:border-teal/30">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm text-ink">{groupLabel(h)}</span>
                            <span className="num shrink-0 text-lg text-teal">#{toFaDigits(h.rank)}</span>
                          </div>
                          <span className="mt-3 block h-1 overflow-hidden rounded-full bg-white/5">
                            <span className="block h-full rounded-full bg-teal/70" style={{ width: `${pct}%` }} />
                          </span>
                          <span className="mt-2 block text-[11px] text-muted">
                            از میان <span className="num">{toFaDigits(h.group_size)}</span> عنوان
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Reveal>
            )}

            <Reveal delay={300} className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/5 bg-surface/40 p-5">
                <p className="kicker text-muted/80">Community</p>
                <p className="num mt-2 text-3xl text-ink">{toFaDigits(leader.votes)}</p>
                <p className="mt-1 text-xs leading-6 text-muted">
                  {leader.votes === 0
                    ? "رأی کاربری هنوز ثبت نشده؛ تا رأی‌ها برسند، سهم جامعه به میانگین کل سایت تکیه دارد."
                    : "رأی کاربر RankVerse — هرچه بیشتر، سهم نظر جامعه در امتیاز پررنگ‌تر."}
                </p>
              </div>
              <div className="rounded-2xl border border-white/5 bg-surface/40 p-5">
                <p className="kicker text-muted/80">How the score is built</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-violet/40 bg-violet/10 px-3 py-1 text-violet-soft">رأی کاربران</span>
                  <span className="text-muted">+</span>
                  <span className="rounded-full border border-teal/40 bg-teal/10 px-3 py-1 text-teal">امتیاز بیرونی</span>
                  <span className="text-muted">=</span>
                  <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-gold">امتیاز ترکیبی</span>
                </div>
                <p className="mt-3 text-xs leading-6 text-muted">میانگین رأی کاربران با تعدیل بیزی (کم‌رأی‌ها به میانگین کل نزدیک می‌مانند) و امتیاز TMDb، با وزن بیشتر برای جامعه.</p>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
