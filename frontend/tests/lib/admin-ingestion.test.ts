import { describe, expect, it } from "vitest";
import { parseTmdbInput } from "@/lib/admin-ingestion";

describe("parseTmdbInput", () => {
  it("takes a bare id without deciding the kind", () => {
    expect(parseTmdbInput(" 550 ")).toEqual({ id: 550, type: null });
  });

  it("reads id and kind from TMDb page links, with or without a locale", () => {
    expect(parseTmdbInput("https://www.themoviedb.org/movie/550-fight-club")).toEqual({ id: 550, type: "movie" });
    expect(parseTmdbInput("https://www.themoviedb.org/tv/1396-breaking-bad?language=fa-IR")).toEqual({ id: 1396, type: "tv_series" });
    expect(parseTmdbInput("themoviedb.org/fa-IR/tv/1396")).toEqual({ id: 1396, type: "tv_series" });
  });

  it("rejects anything else", () => {
    expect(parseTmdbInput("")).toBeNull();
    expect(parseTmdbInput("fight club")).toBeNull();
    expect(parseTmdbInput("https://www.imdb.com/title/tt0137523/")).toBeNull();
    expect(parseTmdbInput("123456789")).toBeNull();
  });
});
