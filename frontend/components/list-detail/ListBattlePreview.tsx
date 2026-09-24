"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { castBattleVote } from "@/lib/api";
import type { ListBattlePair, ListItem } from "@/lib/types";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { entityHref, posterUrl } from "@/lib/list-constellation";
import { SectionHeading } from "./ui";

type Side = "left" | "right";

/**
 * Frameless "which is better?" section: the backend's related pair from
 * this list (shared director first, else shared actor -- never an
 * unrelated pair). Tapping a poster casts a normal /battles vote; there's
 * no in-list battle flow yet, so "all pairs" continues on /battles
 * starting from this pair.
 */
export default function ListBattlePreview({
  pair,
  left,
  right,
}: {
  pair: ListBattlePair;
  left: ListItem;
  right: ListItem;
}) {
  const { getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const [voted, setVoted] = useState<Side | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function vote(winner: Side) {
    const token = getToken();
    if (!token || busy || voted) return;
    setBusy(true);
    setError(null);
    try {
      await castBattleVote(token, {
        category: pair.category,
        left_item: left.entity.id,
        right_item: right.entity.id,
        winner,
      });
      setVoted(winner);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ثبت رأی");
    } finally {
      setBusy(false);
    }
  }

  const params = new URLSearchParams({
    category: pair.category,
    left_id: left.entity.id,
    right_id: right.entity.id,
  });
  const personHref = entityHref("person", pair.person.slug);
  const reasonPrefix = pair.kind === "director" ? "هر دو ساخته" : "هر دو با بازی";

  const sides: [Side, ListItem, number][] = [
    ["left", left, pair.left_rank],
    ["right", right, pair.right_rank],
  ];

  return (
    <section aria-labelledby="list-battle-heading" className="flex flex-col gap-4">
      <div id="list-battle-heading">
        <SectionHeading en="BATTLE" fa="کدام بهتر است؟" tone="text-violet-light" />
      </div>

      <div className="relative grid grid-cols-2 gap-2.5">
        {sides.map(([side, item]) => {
          const title = displayTitle(item.entity);
          const poster = posterUrl(item.entity.poster_path, "w500");
          const isWinner = voted === side;
          return (
            <button
              key={side}
              type="button"
              onClick={() => requireAuth(() => vote(side))}
              disabled={busy || !!voted}
              aria-label={`رأی به ${title}`}
              aria-pressed={isWinner}
              className={`relative aspect-[2/3] w-full overflow-hidden rounded-xl border bg-surface-2 transition disabled:cursor-default ${
                isWinner
                  ? "border-gold shadow-[0_0_0_3px_rgba(232,179,74,0.35)]"
                  : voted
                    ? "border-border opacity-50"
                    : "border-border hover:border-violet-light"
              }`}
            >
              {poster ? (
                <Image src={poster} alt="" fill sizes="(max-width: 1024px) 45vw, 185px" className="object-cover" />
              ) : (
                <span dir="ltr" className="absolute inset-0 flex items-end bg-gradient-to-br from-surface-2 to-bg p-2.5 text-left font-mono text-xs text-muted">
                  {item.entity.title}
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
        {sides.map(([side, item, rank]) => {
          const href = entityHref(item.entity.entity_type, item.entity.slug);
          return (
            <div key={side} className="flex flex-col gap-0.5">
              {href ? (
                <Link href={href} className="text-[15px] font-extrabold leading-snug text-ink hover:text-gold">
                  {item.entity.title_fa || item.entity.title}
                </Link>
              ) : (
                <span className="text-[15px] font-extrabold text-ink">{item.entity.title_fa || item.entity.title}</span>
              )}
              <span className="text-xs text-dim">
                #{toFaDigits(rank)} در لیست
                {item.year ? <> · <span className="num">{toFaDigits(item.year)}</span></> : null}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[13px] leading-[1.8] text-muted" aria-live="polite">
        {voted ? (
          <span className="text-teal">رأیت ثبت شد — رتبه‌بندی عمومی هم جابه‌جا شد.</span>
        ) : (
          <>
            {reasonPrefix}{" "}
            {personHref ? (
              <Link href={personHref} dir="ltr" className="text-violet-light hover:underline">
                {pair.person.title}
              </Link>
            ) : (
              <span dir="ltr" className="text-violet-light">{pair.person.title}</span>
            )}{" "}
            · روی پوستر محبوب‌ترت بزن
          </>
        )}
      </p>
      {error && <p className="text-xs text-gold">{error}</p>}

      <Link
        href={`/battles?${params.toString()}`}
        className="flex min-h-[44px] items-center self-start text-sm font-bold text-violet-light hover:text-ink"
      >
        همه {toFaDigits(pair.pair_count)} جفت این لیست ←
      </Link>
    </section>
  );
}
