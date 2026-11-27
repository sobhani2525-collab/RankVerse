"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { EgoGraph, EgoNode, getEgoGraph, getHeroGraphs } from "@/lib/api";
import EgoSky, { nameOf, SkyLegend } from "@/components/graph/EgoSky";
import SearchBox from "@/components/SearchBox";
import { actionForNode, centerNodeOf, keepCredits } from "@/lib/hero-graph";
import HeroShell from "./HeroShell";

const MAX_CACHED_GRAPHS = 24;

export default function HeroConstellation({ graphs, text }: {
  graphs: EgoGraph[];
  text: ReactNode;
}) {
  const router = useRouter();
  const [path, setPath] = useState<EgoGraph[]>([]);
  const [busy, setBusy] = useState(graphs.length === 0);
  const [failed, setFailed] = useState(false);
  const latestRequest = useRef(0);
  const graphRef = useRef<HTMLDivElement>(null);
  const graphRequests = useRef(new Map<string, Promise<EgoGraph>>());
  const prefetching = useRef(false);

  function loadGraph(slug: string) {
    const cached = graphRequests.current;
    const pending = cached.get(slug);
    if (pending) return pending;

    const request = getEgoGraph(slug)
      .then((nextGraph) => {
        if (!centerNodeOf(nextGraph)) throw new Error("Missing graph center");
        return nextGraph;
      })
      .catch((error) => {
        if (cached.get(slug) === request) cached.delete(slug);
        throw error;
      });
    if (cached.size >= MAX_CACHED_GRAPHS) {
      const oldest = cached.keys().next();
      if (!oldest.done) cached.delete(oldest.value);
    }
    cached.set(slug, request);
    return request;
  }

  // The pool is indexed once on the server; each visit draws one graph at
  // random after mount so the cached server HTML never disagrees with the client.
  useEffect(() => {
    let cancelled = false;
    const request = latestRequest.current;
    const pick = (pool: EgoGraph[]) => pool[Math.floor(Math.random() * pool.length)];
    if (graphs.length > 0) {
      setPath([pick(graphs)]);
      setBusy(false);
    } else {
      setBusy(true);
      getHeroGraphs(0)
        .then((pool) => !cancelled && request === latestRequest.current && pool.length > 0 && setPath([pick(pool)]))
        .catch(() => !cancelled && request === latestRequest.current && setFailed(true))
        .finally(() => {
          if (!cancelled && request === latestRequest.current) setBusy(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [graphs]);

  function returnTo(index: number) {
    latestRequest.current++;
    setBusy(false);
    setFailed(false);
    setPath((current) => current.slice(0, index + 1));
  }

  async function recenter(slug: string, clicked?: EgoNode) {
    if (!clicked) {
      const element = graphRef.current;
      if (element && element.getBoundingClientRect().top >= window.innerHeight) {
        element.scrollIntoView({ block: "start" });
      }
    }
    const visited = path.findIndex((entry) => centerNodeOf(entry)?.slug === slug);
    if (visited !== -1) {
      returnTo(visited);
      return;
    }
    const request = ++latestRequest.current;
    setBusy(true);
    setFailed(false);
    try {
      const nextGraph = await loadGraph(slug);
      if (request !== latestRequest.current) return;
      setPath((current) => [...current, clicked ? keepCredits(nextGraph, clicked) : nextGraph]);
    } catch {
      if (request === latestRequest.current) setFailed(true);
    } finally {
      if (request === latestRequest.current) setBusy(false);
    }
  }

  const graph = path[path.length - 1] ?? null;
  const center = centerNodeOf(graph);

  return (
    <HeroShell
      center={center}
      text={
        <div>
          {text}
          <SearchBox className="z-20 mt-4" scope="galaxy" onSelect={(result) => void recenter(result.slug)} />
        </div>
      }
      graph={
        <>
          {path.length > 0 && (
            <nav aria-label="مسیر کاوش کهکشان" className="relative z-10 flex items-baseline gap-2 text-sm" dir="rtl">
              <span className="shrink-0 text-xs text-[#a3a8cc]">مسیر کاوش</span>
              <ol className="flex min-w-0 flex-wrap items-center gap-x-2">
                {path.map((entry, index) => {
                  const node = centerNodeOf(entry);
                  if (!node) return null;
                  const current = index === path.length - 1;
                  return (
                    <li key={node.id} className="flex min-w-0 items-center gap-2">
                      {index > 0 && <span aria-hidden="true" dir="ltr" className="text-[#a3a8cc]">‹</span>}
                      <button
                        type="button"
                        aria-current={current ? "step" : undefined}
                        onClick={() => { if (!current || busy) returnTo(index); }}
                        className={`min-h-11 min-w-0 break-words rounded-lg px-2 text-start focus-visible:outline-gold ${current ? "font-bold text-gold" : "text-[#c4c8e6] hover:bg-white/10 hover:text-ink"}`}
                      >
                        <bdi>{nameOf(node)}</bdi>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}
          {failed && (
            <p role="alert" className="relative z-10 mb-3 text-center text-sm text-gold">
              دریافت گراف ممکن نشد. دوباره امتحان کن.
            </p>
          )}
          <div ref={graphRef} className="relative">
            {busy && (
              <div role="status" className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
                <span className="sr-only">در حال بارگذاری گراف</span>
                <span aria-hidden="true" className="grid size-16 place-items-center rounded-full border border-gold/30 bg-[#0b0d1c]/90 shadow-lg">
                  <span className="size-9 rounded-full border-2 border-gold/25 border-t-gold motion-safe:animate-spin" />
                </span>
              </div>
            )}
            <div className={busy ? "opacity-50 motion-safe:transition-opacity" : "motion-safe:transition-opacity"} aria-busy={busy}>
              <EgoSky
                graph={graph}
                actionLabel="مرکز کن"
                mobileTall
                bold
                animateRecenter
                onIntent={(node) => {
                  const action = actionForNode(node, graph?.center_id ?? "");
                  if (busy || prefetching.current || action.type !== "recenter") return;
                  if (graphRequests.current.has(action.slug) || path.some((entry) => entry.center_id === node.id)) return;
                  prefetching.current = true;
                  void loadGraph(action.slug).catch(() => {}).finally(() => {
                    prefetching.current = false;
                  });
                }}
                onSelect={(node) => {
                  const action = actionForNode(node, graph?.center_id ?? "");
                  if (action.type === "recenter") void recenter(action.slug, node);
                  else if (action.type === "navigate") router.push(action.href);
                }}
              />
            </div>
          </div>
          <SkyLegend compact />
        </>
      }
    />
  );
}
