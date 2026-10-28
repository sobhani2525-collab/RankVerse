"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EgoGraph, getEgoGraph, getHeroGraphs } from "@/lib/api";
import EgoSky from "@/components/graph/EgoSky";
import { actionForNode, centerNodeOf } from "@/lib/hero-graph";
import { useHeroFullscreen } from "./HeroShell";

export default function HeroConstellation({ graphs }: { graphs: EgoGraph[] }) {
  const router = useRouter();
  const { setCenter } = useHeroFullscreen();
  const [graph, setGraph] = useState<EgoGraph | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // The pool is indexed once on the server; each visit draws one graph at
  // random after mount so the cached server HTML never disagrees with the client.
  useEffect(() => {
    let cancelled = false;
    const pick = (pool: EgoGraph[]) => pool[Math.floor(Math.random() * pool.length)];
    if (graphs.length > 0) setGraph(pick(graphs));
    else
      getHeroGraphs(0)
        .then((pool) => !cancelled && pool.length > 0 && setGraph(pick(pool)))
        .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [graphs]);

  const recenter = useCallback(async (slug: string) => {
    setBusy(true);
    try {
      setGraph(await getEgoGraph(slug));
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, []);

  const center = centerNodeOf(graph);
  useEffect(() => setCenter(center), [center, setCenter]);

  return (
    <>
      <div className={busy ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={busy}>
        <EgoSky
          graph={graph}
          actionLabel="مرکز کن"
          mobileTall
          bold
          onSelect={(node) => {
            const action = actionForNode(node, graph?.center_id ?? "");
            if (action.type === "recenter") void recenter(action.slug);
            else if (action.type === "navigate") router.push(action.href);
          }}
        />
      </div>
      {failed && (
        <p role="alert" className="relative z-10 mb-3 text-center text-sm text-gold">
          دریافت گراف ممکن نشد؛ دوباره امتحان کن.
        </p>
      )}

    </>
  );
}
