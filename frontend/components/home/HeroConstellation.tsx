"use client";

import { useEffect, useState } from "react";
import { GraphFocusKind, requestGraphFocus, scrollToGraph, setHeroCenter } from "@/lib/graph-focus";
import { EgoGraph, getHeroGraphs } from "@/lib/api";
import EgoSky, { nameOf } from "@/components/graph/EgoSky";

export default function HeroConstellation({ graphs }: { graphs: EgoGraph[] }) {
  const [graph, setGraph] = useState<EgoGraph | null>(null);

  // The pool (Iranian + foreign, high-IMDb titles and well-connected people)
  // is indexed once on the server; each visit just draws one of its graphs
  // at random. Done after mount so the cached server HTML never disagrees
  // with the client. If the page was cached before the index was ready, ask
  // the API once from the browser.
  useEffect(() => {
    let cancelled = false;
    const pick = (pool: EgoGraph[]) => pool[Math.floor(Math.random() * pool.length)];
    if (graphs.length > 0) {
      setGraph(pick(graphs));
    } else {
      getHeroGraphs(0)
        .then((pool) => {
          if (!cancelled && pool.length > 0) setGraph(pick(pool));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [graphs]);

  // Tell the "کاوش در کهکشان" button what is at the centre right now.
  useEffect(() => {
    const c = graph?.nodes.find((n) => n.id === graph.center_id);
    if (!c) return setHeroCenter(null);
    const center = { kind: c.entity_type as GraphFocusKind, slug: c.slug };
    setHeroCenter(center);
    // The explorer below starts on the same entity as the hero.
    // ...unless the URL (?focus=) already says where the explorer should be.
    if (!new URLSearchParams(window.location.search).get("focus")) requestGraphFocus({ ...center, reset: true });
  }, [graph]);

  const centerNode = graph?.nodes.find((n) => n.id === graph.center_id) ?? null;

  return (
    <>
    <EgoSky
      graph={graph}
      onSelect={(node) => {
        // A click explores the node in the graph below.
        requestGraphFocus({ kind: node.entity_type as GraphFocusKind, slug: node.slug });
        scrollToGraph({ onlyIfHidden: true });
      }}
    />
    {/* The centre is drawn at random on every visit; say whose sky this is. */}
    <p className="relative z-10 mb-4 min-h-6 text-center text-sm text-muted" aria-live="polite">
      {centerNode && (
        <>
          امروز کهکشانت را با محوریت{" "}
          <button
            type="button"
            className="font-semibold text-gold underline decoration-gold/30 underline-offset-4 transition hover:decoration-gold"
            onClick={() => {
              requestGraphFocus({ kind: centerNode.entity_type as GraphFocusKind, slug: centerNode.slug });
              scrollToGraph();
            }}
          >
            {nameOf(centerNode)}
          </button>{" "}
          کشف کن
        </>
      )}
    </p>
    </>
  );
}
