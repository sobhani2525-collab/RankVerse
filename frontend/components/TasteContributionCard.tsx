import ProgressBar from "./ProgressBar";
import { ContributionStats } from "@/lib/types";

interface TasteContributionCardProps {
  stats: ContributionStats;
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface2 px-3 py-3 text-center">
      <div className="num text-xl font-bold text-ink">{value}</div>
      <div className="mt-1 text-[11px] text-muted">{label}</div>
    </div>
  );
}

export default function TasteContributionCard({ stats }: TasteContributionCardProps) {
  // Every other *_score/*_confidence field this module actually computes
  // (dimension.score, anchor.match_score) ends up 0-100 via a `round(100 * ...)`
  // pattern -- contribution_score likely follows suit once its compute job
  // exists (it doesn't yet; this always reads 0.0 today). Clamped defensively
  // either way so the bar never overflows if that assumption turns out wrong.
  const scorePercent = Math.max(0, Math.min(100, stats.contribution_score));

  return (
    <div className="rounded-xl border border-border bg-surface/60 p-5">
      <h3 className="text-sm font-bold text-ink">فعالیت و مشارکت</h3>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile value={stats.votes_count} label="رأی" />
        <StatTile value={stats.battles_count} label="Battle" />
        <StatTile value={stats.comments_count} label="نظر" />
        <StatTile value={stats.relationships_discovered} label="رابطه‌ی کشف‌شده" />
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
          <span>امتیاز مشارکت</span>
          <span className="num text-ink">{Math.round(stats.contribution_score)}</span>
        </div>
        <ProgressBar value={scorePercent} fillClassName="bg-teal" />
      </div>
    </div>
  );
}
