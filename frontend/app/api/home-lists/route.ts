import { ApiTimeoutError, discoverLists, getFeaturedLists, LISTS_CACHE_TAG, RANKING_TTL } from "@/lib/api";
import { discoverQueryFor, POOL_SIZE } from "@/lib/home-lists";

export async function GET(request: Request) {
  const tab = new URL(request.url).searchParams.get("tab");
  if (tab !== "foryou" && tab !== "fresh" && tab !== "picked") {
    return Response.json({ error: "Invalid list tab" }, { status: 400 });
  }

  try {
    const query = discoverQueryFor(tab);
    const items = query
      ? await discoverLists(query, RANKING_TTL, [LISTS_CACHE_TAG])
      : await getFeaturedLists(POOL_SIZE);
    return Response.json(items);
  } catch (error) {
    if (error instanceof ApiTimeoutError) {
      console.warn("Home lists upstream timed out", tab, error.message);
      return Response.json({ error: "Lists request timed out" }, { status: 504 });
    }
    console.error("Failed to load home lists", tab, error);
    return Response.json({ error: "Failed to load lists" }, { status: 502 });
  }
}
