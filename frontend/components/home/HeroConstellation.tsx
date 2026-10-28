"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EgoGraph, getEgoGraph, getHeroGraphs, getMyPredictedPicks } from "@/lib/api";
import EgoSky, { nameOf, TYPE_LABEL } from "@/components/graph/EgoSky";
import { actionForNode, centerNodeOf } from "@/lib/hero-graph";
import { detailPathFor } from "@/lib/entity-routes";
import { toFaDigits } from "@/lib/format-number";
import { useAuth } from "@/lib/auth-context";
import { useHeroFullscreen } from "./HeroShell";

export default function HeroConstellation({ graphs }: { graphs: EgoGraph[] }) {
  const router = useRouter();
  const { isAuthenticated, getToken } = useAuth();
  const { fullscreen, toggle, setCenter } = useHeroFullscreen();
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

  async function startFromTaste() {
    const token = getToken();
    if (!token) return router.push("/login");
    try {
      const [pick] = await getMyPredictedPicks(token, 1);
      if (pick) await recenter(pick.entity.slug);
    } catch {
      setFailed(true);
    }
  }

  const center = centerNodeOf(graph);
  useEffect(() => setCenter(center), [center, setCenter]);

  return (
    <>
      <div className="relative z-10 mb-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={fullscreen}
          className="min-h-11 rounded-full border border-[#2a2f5c] bg-[#101330]/80 px-4 text-sm font-bold text-ink transition hover:border-[#a99bff] focus-visible:outline-gold"
        >
          {fullscreen ? "✕ بستن" : "⤢ تمام‌صفحه"}
        </button>
        <p className="order-last basis-full text-center text-sm text-[#c4c8e6] sm:order-none sm:basis-auto sm:flex-1" aria-live="polite">
          {center && (
            <>
              امروز کهکشانت را با محوریت <strong className="font-bold text-[#f5b94a]">{nameOf(center)}</strong> کشف کن
            </>
          )}
        </p>
        <button type="button" onClick={startFromTaste} className="min-h-11 rounded-full bg-[#cbbfff] px-5 text-sm font-extrabold text-[#1a1640] hover:bg-[#d9d0ff] focus-visible:outline-gold">
          {isAuthenticated ? "شروع از سلیقهٔ من" : "شروع از سلیقهٔ من"}
        </button>
      </div>

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
