"use client";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { castBattleVote } from "@/lib/api";
import type { MovieListItem } from "@/lib/types";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { entityHref, entityPosterUrl } from "@/lib/list-constellation";
import { SectionHeading } from "@/components/list-detail/ui";

type Side = "left" | "right";

interface Domain {
  key: string;
  label: string;
  items: MovieListItem[];
  /** Replaces the default "از ضعیف‌ترین" hint under the heading. */
  note?: string;
}

// With this many credits or fewer the run covers all of them at once;
// above it every run sticks to one randomly chosen field.
const FEW_CREDITS = 12;

/** Weakest first. Unscored titles only count when fewer than two are scored. */
function battleOrder(items: MovieListItem[]): MovieListItem[] {
  // A vote's category is the entity type, so a run stays within one type
  // (the larger group of the credits).
  const byType = new Map<string, MovieListItem[]>();
  for (const item of items) byType.set(item.entity_type, [...(byType.get(item.entity_type) ?? []), item]);
  const group = [...byType.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  const scored = group.filter((i) => i.computed_score != null);
  const pool = scored.length >= 2 ? scored : group;
  return [...pool].sort((a, b) => (a.computed_score ?? 0) - (b.computed_score ?? 0));
}

function buildDomains(directed: MovieListItem[], created: MovieListItem[], actedIn: MovieListItem[]): Domain[] {
  const unique = [...new Map([...directed, ...created, ...actedIn].map((i) => [i.id, i])).values()];
  if (unique.length <= FEW_CREDITS) {
    const items = battleOrder(unique);
    return items.length >= 2 ? [{ key: "all", label: "آثار", items }] : [];
  }
  return [
    { key: "directed", label: "کارگردانی‌ها", items: directed },
    { key: "created", label: "ساخته‌ها", items: created },
    { key: "acted", label: "بازیگری‌ها", items: actedIn },
  ]
    .map((d) => ({ ...d, items: battleOrder(d.items) }))
    .filter((d) => d.items.length >= 2);
}

/**
 * The person page's BATTLE section, "winner stays" like the list page's:
 * the run starts from the person's weakest titles and the winner of each
 * pair faces the next-weakest until one final winner is left. A person
 * with many credits battles within one randomly picked field (acting,
 * directing...) per run. Each tap is cast as a normal /battles vote.
 */
export default function PersonBattle({
  directed,
  created,
  actedIn,
}: {
  directed: MovieListItem[];
  created: MovieListItem[];
  actedIn: MovieListItem[];
}) {
  const domains = useMemo(() => buildDomains(directed, created, actedIn), [directed, created, actedIn]);
  // Picked after mount so server and client markup agree.
  const [pick, setPick] = useState<{ index: number; runId: number } | null>(null);

  useEffect(() => {
    setPick(domains.length ? { index: Math.floor(Math.random() * domains.length), runId: 0 } : null);
  }, [domains]);

  if (!pick || !domains[pick.index]) return null;

  function again() {
    setPick((p) => {
      if (!p) return p;
      let index = Math.floor(Math.random() * domains.length);
      if (domains.length > 1 && index === p.index) index = (index + 1) % domains.length;
      return { index, runId: p.runId + 1 };
    });
  }

  const domain = domains[pick.index];
  return (
    <section aria-labelledby="person-battle-heading" className="flex scroll-mt-24 flex-col gap-4">
      <BattleRun key={`${pick.runId}:${domain.key}`} domain={domain} onAgain={again} />
    </section>
  );
}

export function BattleRun({ domain, onAgain }: { domain: Domain; onAgain: () => void }) {
  const { getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const items = domain.items;
  const [step, setStep] = useState(0);
  const [champion, setChampion] = useState(0);
  const [streak, setStreak] = useState(0);
  const [voted, setVoted] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const total = items.length - 1;
  const done = step >= total;
  const challenger = Math.min(step + 1, items.length - 1);
  const championItem = items[champion];
  const challengerItem = items[challenger];

  function choose(winner: Side) {
    if (done) return;
    const token = getToken();
    if (token) {
      castBattleVote(token, {
        category: championItem.entity_type,
        left_item: championItem.id,
        right_item: challengerItem.id,
        winner,
      }).catch((err) => setError(err instanceof Error ? err.message : "خطا در ثبت رأی"));
    }
    if (winner === "left") {
      setStreak((n) => n + 1);
    } else {
      setChampion(challenger);
      setStreak(1);
    }
    setVoted((n) => n + 1);
    setStep((s) => s + 1);
  }

  const heading = (
    <div id="person-battle-heading" className="flex flex-col gap-1.5">
      <SectionHeading en="BATTLE" fa={done ? "نبرد تمام شد" : "کدام بهتر است؟"} tone="text-violet-light" />
      <p className="text-xs text-dim">
        {domain.label} · {domain.note ?? "از ضعیف‌ترین"}
        {!done && (
          <>
            {" "}— جفت <span className="num">{toFaDigits(step + 1)}</span> از <span className="num">{toFaDigits(total)}</span>
          </>
        )}
      </p>
    </div>
  );

  const progressBar = (
    <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
      <div
        className="absolute inset-y-0 start-0 rounded-full bg-violet-light transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${(Math.min(step, total) / total) * 100}%` }}
      />
    </div>
  );

  const againButton = (
    <button
      type="button"
      onClick={onAgain}
      className="flex min-h-[44px] items-center self-start rounded-[10px] border border-violet-strong/60 px-4 text-sm font-bold text-violet-light transition hover:border-violet-light"
    >
      نبرد جدید
    </button>
  );

  const poster = (item: MovieListItem, size: string) => {
    const url = entityPosterUrl(item, size);
    return url ? (
      <Image src={url} alt="" fill sizes="(max-width: 1024px) 45vw, 185px" className="object-cover" />
    ) : (
      <span dir="ltr" className="absolute inset-0 flex items-end bg-gradient-to-br from-surface-2 to-bg p-2.5 text-left font-mono text-xs text-muted">
        {item.title}
      </span>
    );
  };

  if (done) {
    return (
      <>
        {heading}
        {progressBar}
        <div className="flex items-center gap-4 battle-swap" aria-live="polite">
          <div className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-xl border-[1.5px] border-gold bg-surface-2 shadow-[0_0_0_4px_rgba(232,179,74,0.18)]">
            {poster(championItem, "w342")}
          </div>
          <div className="flex flex-col gap-1 text-[13px] leading-[1.8]">
            <p className="font-bold text-ink">برنده نهایی {domain.label}</p>
            <p className="text-ink-dim">
              🏆 <span className="font-bold text-gold">{displayTitle(championItem)}</span>
              {streak > 0 && (
                <>
                  {" "}· <span className="num">{toFaDigits(streak)}</span> برد پیاپی
                </>
              )}
            </p>
            {voted > 0 && !error && <p className="text-muted">رأی‌هایت در رتبه‌بندی عمومی ثبت شد.</p>}
          </div>
        </div>
        {error && <p className="text-xs text-gold">{error}</p>}
        {againButton}
      </>
    );
  }

  const sides: [Side, MovieListItem][] = [
    ["left", championItem],
    ["right", challengerItem],
  ];

  return (
    <>
      {heading}

      {/* RTL grid: the champion (the vote's left_item) sits on the right. */}
      <div className="relative grid grid-cols-2 gap-2.5">
        {sides.map(([side, item]) => {
          const isChampion = side === "left";
          return (
            <button
              key={isChampion ? `champion-${champion}` : `challenger-${step}`}
              type="button"
              onClick={() => requireAuth(() => choose(side))}
              aria-label={`انتخاب ${displayTitle(item)}`}
              className={`relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface-2 transition ${
                isChampion
                  ? `border-[1.5px] border-gold shadow-[0_0_0_4px_rgba(232,179,74,0.18)] hover:shadow-[0_0_0_4px_rgba(232,179,74,0.32)] ${champion !== 0 ? "battle-swap" : ""}`
                  : "battle-swap border border-border hover:border-violet-light"
              }`}
            >
              {poster(item, "w500")}
              {isChampion && streak > 0 && (
                <span className="absolute start-2 top-2 rounded-full bg-bg/85 px-2 py-0.5 text-[11px] font-bold text-gold">
                  <span className="num">{toFaDigits(streak)}</span> برد
                </span>
              )}
            </button>
          );
        })}
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-violet-light bg-bg font-mono text-xs text-violet-light shadow-[0_0_0_6px_rgba(11,15,26,0.9)]"
          aria-hidden="true"
        >
          VS
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {sides.map(([side, item]) => {
          const href = entityHref(item.entity_type, item.slug);
          return (
            <div key={side === "left" ? `champion-${champion}` : `challenger-${step}`} className="flex flex-col gap-0.5">
              {href ? (
                <Link href={href} className="text-[15px] font-extrabold leading-snug text-ink hover:text-gold">
                  {displayTitle(item)}
                </Link>
              ) : (
                <span className="text-[15px] font-extrabold leading-snug text-ink">{displayTitle(item)}</span>
              )}
              {item.year ? <span className="num text-xs text-dim">{toFaDigits(item.year)}</span> : null}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1">{progressBar}</div>
        <button
          type="button"
          onClick={() => setStep((s) => s + 1)}
          className="flex min-h-[44px] shrink-0 items-center text-[13px] text-dim transition hover:text-ink"
        >
          رد کردن
        </button>
      </div>

      {error && <p className="text-xs text-gold">{error}</p>}
    </>
  );
}
