import { describe, expect, it } from "vitest";
import { simulateScore, type RankingParams, type ScoreBreakdown } from "@/lib/admin-algorithms";

// app/config.py defaults
const DEFAULTS: RankingParams = {
  ranking_min_votes: 50,
  ranking_user_weight: 0.7,
  ranking_external_prior: 6.5,
  ranking_imdb_min_votes: 5000,
  ranking_tmdb_min_votes: 200,
  ranking_battle_weight: 0.5,
  ranking_battle_min_matches: 20,
};

const base = (over: Partial<ScoreBreakdown>): ScoreBreakdown => ({
  platform_avg: 3.42,
  user_avg: null,
  user_votes: 0,
  bayesian: 0,
  external_source: "prior",
  external_rating: null,
  external_votes: 0,
  external: 0,
  user_weight: 0,
  blended: 0,
  elo: null,
  matches: 0,
  battle_adjustment: 0,
  final: 0,
  ...over,
});

// Expected values computed with app/modules/ranking/service.py (RankingService) on the same inputs.
describe("simulateScore with the default parameters matches RankingService", () => {
  it("IMDb-rated title with user votes and battles", () => {
    const r = simulateScore(
      base({ user_avg: 4.6667, user_votes: 3, external_source: "imdb", external_rating: 8.4, external_votes: 120000, elo: 1400, matches: 30 }),
      DEFAULTS,
    );
    expect(r.bayesian).toBeCloseTo(3.490568, 5);
    expect(r.external).toBeCloseTo(8.324, 5);
    expect(r.blended).toBe(8.27);
    expect(r.battle).toBeCloseTo(0.15, 6);
    expect(r.final).toBe(8.42);
  });

  it("TMDb-only title with no user votes", () => {
    const r = simulateScore(base({ external_source: "tmdb", external_rating: 7, external_votes: 300 }), DEFAULTS);
    expect(r.userWeight).toBe(0);
    expect(r.final).toBe(6.8);
  });

  it("no external rating, a losing battle record", () => {
    const r = simulateScore(base({ user_avg: 2.5, user_votes: 12, elo: 1050, matches: 8 }), DEFAULTS);
    expect(r.bayesian).toBeCloseTo(3.241935, 5);
    expect(r.battle).toBeCloseTo(-0.053571, 5);
    expect(r.final).toBe(6.45);
  });

  it("a parameter change moves the score the expected way", () => {
    const b = base({ user_avg: 5, user_votes: 40, external_source: "tmdb", external_rating: 6, external_votes: 1000 });
    const lowM = simulateScore(b, { ...DEFAULTS, ranking_min_votes: 10 });
    const highM = simulateScore(b, { ...DEFAULTS, ranking_min_votes: 500 });
    expect(lowM.final).toBeGreaterThan(highM.final); // fewer votes needed -> users' 5 stars count more
  });
});
