import { describe, expect, it } from "vitest";
import { discoverQueryFor, withoutFeatured } from "@/lib/home-lists";
import type { ListSummary } from "@/lib/types";

const l = (slug: string) => ({ slug }) as ListSummary;

describe("discoverQueryFor", () => {
  it("uses a smaller popular pool for homepage recommendations", () => {
    expect(discoverQueryFor("fresh")).toEqual({ sort: "newest", page_size: 20 });
    expect(discoverQueryFor("foryou")).toEqual({ sort: "popular", page_size: 8 });
    expect(discoverQueryFor("picked")).toBeNull();
  });
});

describe("withoutFeatured", () => {
  it("drops the featured list and caps the count", () => {
    expect(withoutFeatured([l("a"), l("b"), l("c")], "b", 5).map((x) => x.slug)).toEqual(["a", "c"]);
    expect(withoutFeatured([l("a"), l("b"), l("c")], null, 2)).toHaveLength(2);
  });
});
