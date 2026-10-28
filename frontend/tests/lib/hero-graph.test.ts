import { describe, expect, it } from "vitest";
import { actionForNode, centerNodeOf } from "@/lib/hero-graph";
import type { EgoGraph, EgoNode } from "@/lib/api";

const node = (id: string, entity_type: string, slug = id): EgoNode =>
  ({ id, slug, title: id, title_fa: null, entity_type, year: null, score: null, image_url: null, role: "work" }) as EgoNode;

describe("actionForNode", () => {
  it("recentres on a film, series or artist", () => {
    expect(actionForNode(node("p", "person"), "c")).toEqual({ type: "recenter", slug: "p" });
    expect(actionForNode(node("a", "movie"), "c")).toEqual({ type: "recenter", slug: "a" });
    expect(actionForNode(node("b", "tv_series"), "c")).toEqual({ type: "recenter", slug: "b" });
  });
  it("navigates for genres", () => {
    expect(actionForNode(node("g", "genre"), "c")).toEqual({ type: "navigate", href: "/genre/g" });
  });
  it("ignores the current centre", () => {
    expect(actionForNode(node("c", "movie"), "c")).toEqual({ type: "none" });
  });
});

describe("centerNodeOf", () => {
  it("finds the centre", () => {
    const g: EgoGraph = { center_id: "c", nodes: [node("a", "movie"), node("c", "movie")], edges: [] };
    expect(centerNodeOf(g)?.id).toBe("c");
    expect(centerNodeOf(null)).toBeNull();
  });
});
