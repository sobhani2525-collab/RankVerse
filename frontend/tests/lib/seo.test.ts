import { describe, expect, it } from "vitest";
import { movieJsonLd, movieMetadata } from "@/lib/seo";
import type { MovieDetail } from "@/lib/types";

const person = (title: string, title_fa: string | null = null) => ({ id: title, slug: title.toLowerCase(), title, title_fa });

function movie(overrides: Partial<Record<string, unknown>> = {}): MovieDetail {
  return {
    id: "1",
    slug: "the-shawshank-redemption-1994",
    title: "The Shawshank Redemption",
    title_fa: "رستگاری در شاوشنک",
    year: 1994,
    runtime: 142,
    overview: "دو مرد زندانی عهد می‌بندند.",
    poster_path: "/p.jpg",
    computed_score: 9.3,
    total_votes: 120,
    genres: [{ slug: "drama", title: "Drama" }],
    directors: [person("Frank Darabont", "فرانک دارابونت")],
    cast: [person("Tim Robbins")],
    ...overrides,
  } as unknown as MovieDetail;
}

describe("movieMetadata", () => {
  it("gives each movie its own title, canonical path and social image", () => {
    const meta = movieMetadata(movie(), "/movies/the-shawshank-redemption-1994");
    expect(String(meta.title)).toContain("رستگاری در شاوشنک");
    expect(meta.alternates?.canonical).toBe("/movies/the-shawshank-redemption-1994");
    expect(meta.robots).toMatchObject({ index: true });
    expect(JSON.stringify(meta.openGraph)).toContain("image.tmdb.org");
  });
  it("mentions the genre and director in the description, within the length cap", () => {
    const meta = movieMetadata(movie(), "/movies/x");
    expect(meta.description).toContain("درام");
    expect(meta.description).toContain("فرانک دارابونت");
    expect((meta.description ?? "").length).toBeLessThanOrEqual(165);
  });
});

describe("movieJsonLd", () => {
  const graph = (m: MovieDetail) => (movieJsonLd(m, "/movies/x")["@graph"] as Record<string, unknown>[]);

  it("describes a Movie with duration, genre and an aggregate rating", () => {
    const item = graph(movie())[0];
    expect(item["@type"]).toBe("Movie");
    expect(item.duration).toBe("PT142M");
    expect(item.alternateName).toBe("The Shawshank Redemption");
    expect(item.aggregateRating).toMatchObject({ ratingValue: 9.3, ratingCount: 120 });
  });
  it("omits the rating block when nobody has voted", () => {
    const item = graph(movie({ computed_score: null, total_votes: 0 }))[0];
    expect(item).not.toHaveProperty("aggregateRating");
  });
});
