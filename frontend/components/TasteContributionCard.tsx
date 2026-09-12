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
  // contribution_score is an open-ended weighted sum of the three counts
  // (see ContributionStatsComputer in compute.py), not inherently 0-100 --
  // clamped here only so the bar itself never overflows past full.
  const scorePercent = Math.max(0, Math.min(100, stats.contribution_score));

  return (
    <div className="rounded-xl border border-border bg-surface/60 p-5">
      <h3 className="text-sm font-bold text-ink">فعالیت و مشارکت</h3>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatTile value={stats.votes_count} label="رأی" />
        <StatTile value={stats.battles_count} label="Battle" />
        <StatTile value={stats.comments_count} label="نظر" />
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
