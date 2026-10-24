/**
 * Contribution levels for user_contribution_stats.contribution_score, which
 * is an unbounded weighted count (ratings x1, battles x2, comments x3,
 * ♥ x0.5 -- see ContributionStatsComputer). A 0-100 bar saturated for
 * every active user; levels keep showing progress at any score.
 */
export interface ContributionTier {
  name: string;
  min: number;
}

export const CONTRIBUTION_TIERS: ContributionTier[] = [
  { name: "تازه‌وارد", min: 0 },
  { name: "تماشاگر", min: 25 },
  { name: "علاقه‌مند", min: 100 },
  { name: "منتقد", min: 300 },
  { name: "سینه‌فیل", min: 750 },
  { name: "استاد سینما", min: 2000 },
];

export function contributionTier(score: number) {
  let index = 0;
  CONTRIBUTION_TIERS.forEach((tier, i) => {
    if (score >= tier.min) index = i;
  });
  const current = CONTRIBUTION_TIERS[index];
  const next = CONTRIBUTION_TIERS[index + 1] ?? null;
  const progress = next ? ((score - current.min) / (next.min - current.min)) * 100 : 100;
  return { current, next, level: index + 1, progress, remaining: next ? Math.ceil(next.min - score) : 0 };
}
