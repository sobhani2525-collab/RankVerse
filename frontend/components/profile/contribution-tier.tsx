import ProgressBar from "@/components/ProgressBar";
import { MonoLabel } from "@/components/list-detail/ui";
import { CONTRIBUTION_TIERS, contributionTier } from "@/lib/contribution-tier";
import { toFaDigits } from "@/lib/format-number";

/** Contribution level strip under the profile's stat tiles: the level name,
 *  the raw score, and progress toward the next level. */
export default function ContributionTierStrip({ score }: { score: number }) {
  const { current, next, level, progress, remaining } = contributionTier(score);

  return (
    <div className="mt-4 rounded-2xl border border-border-soft bg-surface/60 px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-2.5">
          <MonoLabel size="text-[10px]">
            LEVEL {level}/{CONTRIBUTION_TIERS.length}
          </MonoLabel>
          <span className="text-sm font-bold text-teal">{current.name}</span>
        </div>
        <span className="text-xs text-muted">
          امتیاز مشارکت <span className="num text-ink">{toFaDigits(Math.round(score))}</span>
        </span>
      </div>
      <div className="mt-2.5">
        <ProgressBar value={progress} fillClassName="bg-gradient-to-l from-teal to-gold" />
      </div>
      <p className="mt-1.5 text-[11px] text-dim">
        {next ? (
          <>
            <span className="num">{toFaDigits(remaining)}</span> امتیاز تا سطح «{next.name}»
          </>
        ) : (
          "بالاترین سطح مشارکت"
        )}
      </p>
    </div>
  );
}
