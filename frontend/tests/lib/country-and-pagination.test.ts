import { describe, expect, it } from "vitest";
import { countryNameFa } from "@/lib/country";
import { pageWindow } from "@/lib/pagination";

describe("countryNameFa", () => {
  it("names real country codes in Persian, whatever the casing", () => {
    expect(countryNameFa("IR")).toBe(countryNameFa("ir"));
    expect(countryNameFa("US")).toMatch(/[؀-ۿ]/);
  });
  it("returns null for missing or invalid codes instead of showing junk", () => {
    expect(countryNameFa(null)).toBeNull();
    expect(countryNameFa("")).toBeNull();
    expect(countryNameFa("USA")).toBeNull();
    expect(countryNameFa("ZZ")).toBeNull();
  });
});

describe("pageWindow", () => {
  it("shows every page when there are few", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it("collapses far-away pages into gaps but always keeps first and last", () => {
    expect(pageWindow(1, 958)).toEqual([1, 2, 3, null, 958]);
    expect(pageWindow(500, 958)).toEqual([1, null, 498, 499, 500, 501, 502, null, 958]);
    expect(pageWindow(958, 958)).toEqual([1, null, 956, 957, 958]);
  });
  it("fills a one-page gap with the page itself instead of an ellipsis", () => {
    expect(pageWindow(5, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(pageWindow(6, 10)).toEqual([1, null, 4, 5, 6, 7, 8, 9, 10]);
  });
  it("clamps an out-of-range current page", () => {
    expect(pageWindow(99, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(0, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});
