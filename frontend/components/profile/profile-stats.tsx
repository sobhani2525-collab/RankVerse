import ProgressBar from "@/components/ProgressBar";
import { MonoLabel } from "@/components/list-detail/ui";
import { CONTRIBUTION_TIERS, contributionTier } from "@/lib/contribution-tier";
import { toFaDigits } from "@/lib/format-number";

export interface ProfileStat {
  key: string;
  value: number;
  label: string;
  icon: React.ReactNode;
  /** Text color class for the number and icon. */
  tone: string;
  href?: string;
}

/**
 * One card for the profile's activity: the non-zero counts side by side,
 * then the contribution level with its progress toward the next one. A
 * zero count is left out rather than shown as "۰"; with nothing at all to
 * show, only the level remains.
 */
export default function ProfileStats({ stats, contributionScore }: { stats: ProfileStat[]; contributionScore: number | null }) {
  const shown = stats.filter((s) => s.value > 0);
  if (shown.length === 0 && contributionScore == null) return null;
  const tier = contributionScore != null ? contributionTier(contributionScore) : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border-soft bg-surface/60">
      <div
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: "linear-gradient(90deg, transparent, #4FB8A6, #E8B34A, #A99BFF, transparent)" }}
        aria-hidden="true"
      />
      {shown.length > 0 && (
        <div className="grid grid-cols-2 sm:flex sm:divide-x sm:divide-x-reverse sm:divide-border-soft">
          {shown.map((s) => {
            const body = (
              <>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] ${s.tone}`}>
                  {s.icon}
                </span>
                <span className="min-w-0">
                  <span className={`num block text-2xl font-bold leading-none ${s.tone}`}>{toFaDigits(s.value)}</span>
                  <span className="mt-1.5 block truncate text-xs text-muted">{s.label}</span>
                </span>
              </>
            );
            const cls = "flex flex-1 items-center gap-3 px-5 py-5 sm:px-6";
            return s.href ? (
              <a key={s.key} href={s.href} className={`${cls} transition hover:bg-white/[0.03]`}>
                {body}
              </a>
            ) : (
              <div key={s.key} className={cls}>
                {body}
              </div>
            );
          })}
        </div>
      )}

      {tier && (
        <div className={`px-5 py-4 sm:px-6 ${shown.length > 0 ? "border-t border-border-soft" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div className="flex items-baseline gap-2.5">
              <span className="text-sm font-bold text-teal">{tier.current.name}</span>
              <MonoLabel size="text-[10px]">
                LEVEL {tier.level}/{CONTRIBUTION_TIERS.length}
              </MonoLabel>
            </div>
            <span className="text-xs text-muted">
              امتیاز مشارکت <span className="num text-ink">{toFaDigits(Math.round(contributionScore!))}</span>
            </span>
          </div>
          <div className="mt-2.5">
            <ProgressBar value={tier.progress} fillClassName="bg-gradient-to-l from-teal to-gold" />
          </div>
          <p className="mt-1.5 text-[11px] text-dim">
            {tier.next ? (
              <>
                <span className="num">{toFaDigits(tier.remaining)}</span> امتیاز تا سطح «{tier.next.name}»
              </>
            ) : (
              "بالاترین سطح مشارکت"
            )}
          </p>
        </div>
      )}
    </div>
  );
}
