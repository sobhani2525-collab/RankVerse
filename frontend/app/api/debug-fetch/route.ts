import { NextResponse } from "next/server";
import { getRankingsPage, discoverLists, getMovieBySlug, getMovieRankings, RANKING_TTL } from "@/lib/api";
import HomePage from "@/app/page";

// Temporary diagnostic route: the home page throws a bare, message-less 500
// from the App Router when it does its full parallel fetch fan-out (movie
// rankings, tv rankings, discoverLists x2, movie detail batch, ranking
// highlights) -- but every individual backend endpoint answers 200 via
// curl/browser. This calls each of the home page's real data-layer
// functions one at a time and reports which one throws, and what. Remove
// once the cause is found.
export async function GET() {
  const results: Record<string, unknown> = {};

  async function run(name: string, fn: () => Promise<unknown>) {
    try {
      const value = await fn();
      results[name] = { ok: true, sample: JSON.stringify(value)?.slice(0, 300) };
    } catch (e) {
      results[name] = {
        ok: false,
        error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
        stack: e instanceof Error ? e.stack?.slice(0, 500) : undefined,
      };
    }
  }

  await run("movieRankings", () => getRankingsPage("movie", { page_size: 24 }));
  await run("tvRankings", () => getRankingsPage("tv_series", { page_size: 10 }));
  await run("discoverListsNewest", () => discoverLists({ sort: "newest", page_size: 6 }, RANKING_TTL));
  await run("discoverListsPopular", () => discoverLists({ sort: "popular", page_size: 1 }, RANKING_TTL));
  await run("movieBySlug", () => getMovieBySlug("white-scratch-2025"));
  await run("movieRankingHighlights", () => getMovieRankings("white-scratch-2025"));
  await run("homePageDataAndConstruction", async () => {
    const element = await HomePage();
    return { constructed: !!element };
  });

  return NextResponse.json(results);
}
