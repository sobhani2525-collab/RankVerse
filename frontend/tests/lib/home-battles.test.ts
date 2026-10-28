import { describe, expect, it } from "vitest";
import { applyPairVote } from "@/lib/home-battles";

describe("applyPairVote", () => {
  it("records the side and adds one vote", () => {
    expect(applyPairVote({ chosen: null, votes: 7 }, "b")).toEqual({ chosen: "b", votes: 8 });
  });
  it("ignores a second vote", () => {
    const voted = { chosen: "a" as const, votes: 8 };
    expect(applyPairVote(voted, "b")).toBe(voted);
  });
});
