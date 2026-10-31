"use client";

import { useMemo, useState } from "react";
import EgoSky, { SkyLegend, nameOf } from "@/components/graph/EgoSky";
import { SectionHeading } from "@/components/list-detail/ui";
import { EgoGraph, EgoNode, getEgoGraph } from "@/lib/api";
import { GenreSummary, PersonSummary } from "@/lib/types";

type Credit = "directed_by" | "creator" | "acted_in";

export interface OverviewPerson {
  person: PersonSummary;
  credits: Credit[];
}

// Outer-ring stars at most: past this the labels start to collide.
const MAX_OUTER = 10;
const MAX_GENRES = 2;

/**
 * The page's own sky, filled out with what the page already knows: the
 * ego graph only carries a few of the title's people, so the rest of the
 * credited cast (and the genres, when the graph has none) join the outer
 * ring, linked straight to the centre.
 */
function withPageCredits(graph: EgoGraph, people: OverviewPerson[], genres: GenreSummary[]): EgoGraph {
  const nodes = [...graph.nodes];
  const edges = [...graph.edges];
  const have = new Set(nodes.map((n) => n.id));
  let outer = nodes.filter((n) => n.role === "person" || n.role === "genre").length;

  if (!nodes.some((n) => n.role === "genre")) {
    for (const g of genres.slice(0, MAX_GENRES)) {
      if (have.has(g.id) || outer >= MAX_OUTER) continue;
      nodes.push({ id: g.id, slug: g.slug, title: g.title, title_fa: null, entity_type: "genre", year: null, score: null, image_url: null, role: "genre" });
      edges.push({ source: graph.center_id, target: g.id, kind: "genre" });
      have.add(g.id);
      outer++;
    }
  }
  for (const { person, credits } of people) {
    if (outer >= MAX_OUTER) break;
    if (have.has(person.id)) continue;
    nodes.push({
      id: person.id,
      slug: person.slug,
      title: person.title,
      title_fa: person.title_fa ?? null,
      entity_type: "person",
      year: null,
      score: null,
      image_url: person.image_url ?? null,
      role: "person",
      credits,
    });
    edges.push({ source: graph.center_id, target: person.id, kind: "credit" });
    have.add(person.id);
    outer++;
  }
  return { ...graph, nodes, edges };
}

/**
 * OVERVIEW on a movie / series page, as a graph: the home hero's orbit sky
 * (EgoSky) around this title, plus the home explorer's walk -- a click on a
 * person or title re-centres the sky on it, and one button leads back home.
 */
export default function EntityOverviewGraph({
  self,
  initial,
  people,
  genres,
}: {
  self: EgoNode;
  initial: EgoGraph | null;
  people: OverviewPerson[];
  genres: GenreSummary[];
}) {
  const home = useMemo(
    () => withPageCredits(initial ?? { center_id: self.id, nodes: [self], edges: [] }, people, genres),
    [initial, self, people, genres]
  );
  const [trail, setTrail] = useState<EgoGraph[]>([home]);
  const [loading, setLoading] = useState<string | null>(null);

  const graph = trail[trail.length - 1];
  const atHome = trail.length === 1;

  async function explore(node: EgoNode) {
    // Genres have no orbit of their own; their hover card links to the genre page.
    if (node.entity_type === "genre" || node.id === graph.center_id || loading) return;
    const seen = trail.findIndex((g) => g.center_id === node.id);
    if (seen >= 0) {
      setTrail(trail.slice(0, seen + 1));
      return;
    }
    setLoading(node.id);
    try {
      const next = await getEgoGraph(node.slug);
      setTrail((t) => [...t, next]);
    } catch {
      // The orbit stays where it was; the star's hover card still links to its page.
    } finally {
      setLoading(null);
    }
  }

  if (home.nodes.length < 2) return null;

  const typeFa = self.entity_type === "tv_series" ? "سریال" : "فیلم";

  return (
    <div>
      <SectionHeading en="OVERVIEW" fa={`نمای کلی ${typeFa}`} tone="text-gold" />
      <div className="relative mt-4">
        <div className="relative">
          {!atHome && (
            <button
              type="button"
              onClick={() => setTrail([home])}
              className="absolute right-4 top-4 z-10 rounded-xl border border-white/10 bg-[#0A0F18]/70 px-3 py-1.5 text-xs text-muted backdrop-blur-md transition hover:border-gold/40 hover:text-ink sm:right-6 sm:top-6"
            >
              بازگشت به {nameOf(self)}
            </button>
          )}
          <div className={`relative mx-auto w-full max-w-[760px] transition-opacity duration-300 ${loading ? "opacity-50" : ""}`}>
            <EgoSky graph={graph} onSelect={explore} actionLabel="چرخاندن مدار دور آن" mobileTall bold fontScale={0.85} />
          </div>
          <SkyLegend compact />
        </div>
      </div>
    </div>
  );
}
