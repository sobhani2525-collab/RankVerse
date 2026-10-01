"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { SectionHeading } from "@/components/list-detail/ui";
import { entityHref } from "@/lib/list-constellation";
import { SuggestedBattle, SuggestedBattleEntity } from "@/lib/types";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { castBattleVote } from "@/lib/api";
import { publishEntityScore } from "@/components/LiveScore";

export interface BattleReason {
  text: string;
  tone: "people" | "genre";
}

type Side = "left" | "right";
type Pick = "win" | "lose" | null;

function PosterBox({
  entity,
  pick,
  disabled,
  onSelect,
}: {
  entity: SuggestedBattleEntity;
  pick: Pick;
  disabled: boolean;
  onSelect: () => void;
}) {
  const posterUrl = entity.poster_path ? `https://image.tmdb.org/t/p/w342${entity.poster_path}` : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={pick === "win"}
      aria-label={`انتخاب ${displayTitle(entity)}`}
      className={`relative block aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface-2 transition disabled:cursor-default ${
        pick === "win"
          ? "border-[1.5px] border-gold shadow-[0_0_0_4px_rgba(232,179,74,0.32)]"
          : pick === "lose"
            ? "border border-border opacity-50"
            : "border border-border hover:border-violet-light"
      }`}
    >
      {posterUrl ? (
        <Image
          src={posterUrl}
          alt={displayTitle(entity)}
          fill
          sizes="(max-width: 768px) 45vw, 260px"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted">بدون پوستر</div>
      )}
      {pick === "win" && (
        <span className="absolute inset-0 flex items-center justify-center bg-emerald-500/30" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" className="h-14 w-14 text-white drop-shadow-md">
            <circle cx="12" cy="12" r="11" fill="currentColor" fillOpacity="0.15" />
            <path d="M7 12.5l3.2 3.2L17 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </button>
  );
}

function TitleBlock({ entity, score }: { entity: SuggestedBattleEntity; score: number | null }) {
  const href = entityHref(entity.entity_type, entity.slug);
  const title = displayTitle(entity);
  return (
    <div className="flex flex-col items-start gap-1 text-start">
      {href ? (
        <Link href={href} className="text-[15px] font-extrabold leading-snug text-ink transition hover:text-gold">
          {title}
        </Link>
      ) : (
        <span className="text-[15px] font-extrabold leading-snug text-ink">{title}</span>
      )}
      {score != null && (
        <span className="num text-xs text-dim">{toFaDigits(score.toFixed(1))}</span>
      )}
    </div>
  );
}

/**
 * Restyled to match the list detail page's ListBattlePreview visual language
 * (violet "BATTLE" kicker, VS badge, gold-ringed poster for "this" entity) --
 * but the underlying data/behavior is unchanged from before: still a single
 * server-picked pair (see useSuggestedBattle/BattleSection) with one
 * "شروع نبرد" link into the standalone battle flow, not the list page's
 * multi-opponent "winner stays" run.
 */
export default function SuggestedBattleCard({
  battle,
  reason,
}: {
  battle: SuggestedBattle;
  reason?: BattleReason | null;
}) {
  const { getToken } = useAuth();
  const { requireAuth } = useAuthGate();
  const [picked, setPicked] = useState<Side | null>(null);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<{ left: number | null; right: number | null }>({
    left: battle.left.computed_score,
    right: battle.right.computed_score,
  });

  async function vote(side: Side) {
    const token = getToken();
    if (!token || voting || picked) return;
    setVoting(true);
    setError(null);
    try {
      const result = await castBattleVote(token, {
        category: battle.category,
        left_item: battle.left.id,
        right_item: battle.right.id,
        winner: side,
      });
      setPicked(side);
      const left = result.left_computed_score ?? scores.left;
      const right = result.right_computed_score ?? scores.right;
      setScores({ left, right });
      if (left != null) publishEntityScore(battle.left.id, left);
      if (right != null) publishEntityScore(battle.right.id, right);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا در ثبت رأی");
    } finally {
      setVoting(false);
    }
  }

  function select(side: Side) {
    if (picked || voting) return;
    if (!getToken()) requireAuth(() => vote(side));
    else vote(side);
  }

  const pickOf = (side: Side): Pick => (picked == null ? null : picked === side ? "win" : "lose");

  const battleHref = `/battles?category=${battle.category}&left_id=${battle.left.id}&right_id=${battle.right.id}`;
  const toneClass = reason?.tone === "genre" ? "text-teal" : "text-violet-light";
  const dotClass = reason?.tone === "genre" ? "bg-teal" : "bg-violet-light";

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
      <div className="flex flex-col items-start gap-3 lg:w-[300px] lg:shrink-0">
        <SectionHeading en="BATTLE" fa="کدام بهتر است؟" tone="text-violet-light" />
        <p className="text-xs text-dim">روی پوستر گزینهٔ برتر کلیک کن؛ امتیاز ترکیبی همان لحظه به‌روز می‌شود</p>

        {reason && (
          <div className={`flex items-center gap-2 text-xs ${toneClass}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
            {reason.text}
          </div>
        )}

        <Link href={battleHref} className="btn-primary mt-1 w-full justify-center text-sm hover:opacity-90 lg:w-auto">
          شروع نبرد
        </Link>
      </div>

      <div className="lg:max-w-[560px] lg:flex-1">
        <div className="relative grid grid-cols-2 gap-2.5">
          <PosterBox entity={battle.left} pick={pickOf("left")} disabled={voting || picked != null} onSelect={() => select("left")} />
          <PosterBox entity={battle.right} pick={pickOf("right")} disabled={voting || picked != null} onSelect={() => select("right")} />
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-violet-light bg-bg font-mono text-xs text-violet-light shadow-[0_0_0_6px_rgba(11,15,26,0.9)]"
            aria-hidden="true"
          >
            VS
          </div>
        </div>

        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
          <TitleBlock entity={battle.left} score={scores.left} />
          <TitleBlock entity={battle.right} score={scores.right} />
        </div>
        {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
      </div>
    </div>
  );
}
