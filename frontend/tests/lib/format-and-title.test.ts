import { describe, expect, it } from "vitest";
import { toFaDigits } from "@/lib/format-number";
import { displayTitle } from "@/lib/title";
import { genreLabel } from "@/lib/genre-labels";
import { detailPathFor } from "@/lib/entity-routes";

describe("toFaDigits", () => {
  it("converts ASCII digits and leaves other characters alone", () => {
    expect(toFaDigits(1994)).toBe("۱۹۹۴");
    expect(toFaDigits("8.3")).toBe("۸.۳");
    expect(toFaDigits("rank 07")).toBe("rank ۰۷");
  });
});

describe("displayTitle", () => {
  it("shows Persian title with the original in parentheses", () => {
    expect(displayTitle({ title: "The Godfather", title_fa: "پدرخوانده" })).toBe("پدرخوانده (The Godfather)");
  });
  it("falls back to the plain title without a translation", () => {
    expect(displayTitle({ title: "Heat", title_fa: null })).toBe("Heat");
    expect(displayTitle({ title: "Heat" })).toBe("Heat");
  });
});

describe("genreLabel", () => {
  it("translates known genres whatever the casing or separator", () => {
    expect(genreLabel("Drama")).toBe("درام");
    expect(genreLabel("Science Fiction")).toBe("علمی-تخیلی");
  });
  it("humanizes unknown genres instead of failing", () => {
    expect(genreLabel("neo noir")).toBe("Neo Noir");
  });
});

describe("detailPathFor", () => {
  it("maps entity types to their route", () => {
    expect(detailPathFor("movie", "heat-1995")).toBe("/movies/heat-1995");
    expect(detailPathFor("tv_series", "lost-2004")).toBe("/tv-series/lost-2004");
    expect(detailPathFor("person", "x-1")).toBe("/person/x-1");
    expect(detailPathFor("genre", "drama")).toBe("/genre/drama");
  });
  it("returns null for types without a page", () => {
    expect(detailPathFor("album", "x")).toBeNull();
  });
});
