import { describe, expect, it } from "vitest";
import { discoverQueryFor, withoutFeatured } from "@/lib/home-lists";
import type { ListSummary } from "@/lib/types";

const l = (slug: string) => ({ slug }) as ListSummary;

describe("discoverQueryFor", () => {
  it("maps tabs to sorts", () => {
    expect(discoverQueryFor("fresh")?.sort).toBe("newest");
    expect(discoverQueryFor("foryou")?.sort).toBe("popular");
    expect(discoverQueryFor("picked")).toBeNull();
  });
});

describe("withoutFeatured", () => {
  it("drops the featured list and caps the count", () => {
    expect(withoutFeatured([l("a"), l("b"), l("c")], "b", 5).map((x) => x.slug)).toEqual(["a", "c"]);
    expect(withoutFeatured([l("a"), l("b"), l("c")], null, 2)).toHaveLength(2);
  });
});
