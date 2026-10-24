import ProgressBar from "@/components/ProgressBar";
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
        <div className="flex flex-wrap" dir="rtl">
          {shown.map((s, i) => {
            const body = (
              <>
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.05] ${s.tone}`}>
                  {s.icon}
                </span>
                <span className={`num mt-3 block text-3xl font-bold leading-none sm:text-4xl ${s.tone}`}>
                  {toFaDigits(s.value)}
                </span>
                <span className="mt-2 block text-sm text-muted">{s.label}</span>
              </>
            );
            // Cells share the row evenly; a hairline sits on each cell's
            // inline-end edge (left, in RTL) except the last one.
            const cls = `flex min-w-[50%] flex-1 flex-col items-center px-4 py-6 text-center sm:min-w-0 ${
              i < shown.length - 1 ? "sm:border-e sm:border-border-soft" : ""
            }`;
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
        <div className={`px-5 py-5 sm:px-7 ${shown.length > 0 ? "border-t border-border-soft" : ""}`}>
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <div>
              <span className="block text-xs text-muted">
                سطح <span className="num">{toFaDigits(tier.level)}</span> از <span className="num">{toFaDigits(CONTRIBUTION_TIERS.length)}</span>
              </span>
              <span className="mt-1 block text-lg font-bold text-teal">{tier.current.name}</span>
            </div>
            <span className="text-sm text-muted">
              امتیاز مشارکت <span className="num text-base font-bold text-ink">{toFaDigits(Math.round(contributionScore!))}</span>
            </span>
          </div>
          <div className="mt-3">
            <ProgressBar value={tier.progress} trackClassName="bg-surface2 !h-2.5" fillClassName="bg-gradient-to-l from-teal to-gold" />
          </div>
          <p className="mt-2 text-xs text-dim">
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
