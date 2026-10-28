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
  const { fullscreen, toggle } = useHeroFullscreen();
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
  const centerHref = center ? detailPathFor(center.entity_type, center.slug) : null;

  return (
    <>
      <div className="relative z-10 mb-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={fullscreen}
          className="min-h-11 rounded-xl border border-border bg-surface/60 px-4 text-sm font-semibold text-ink transition hover:border-violet-soft focus-visible:outline-gold"
        >
          {fullscreen ? "✕ بستن" : "⤢ تمام‌صفحه"}
        </button>
        <button type="button" onClick={startFromTaste} className="btn-primary min-h-11 rounded-xl px-5 text-sm">
          {isAuthenticated ? "شروع از سلیقهٔ من" : "ورود و شروع از سلیقه‌ام"}
        </button>
      </div>

      <div className={busy ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={busy}>
        <EgoSky
          graph={graph}
          actionLabel="مرکز کن"
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

      {center && (
        <div className="relative z-10 mt-4 flex items-center gap-4 rounded-3xl border border-border bg-surface/70 p-4">
          <div className="relative h-[104px] w-[72px] shrink-0 overflow-hidden rounded-xl bg-surface2">
            {center.image_url && <Image src={center.image_url} alt="" fill sizes="72px" className="object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">مرکز کهکشان</p>
            <p className="mt-1 truncate text-lg font-bold text-gold">{nameOf(center)}</p>
            <p className="text-xs text-muted">
              {TYPE_LABEL[center.entity_type]}
              {center.year ? ` · ${toFaDigits(center.year)}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {centerHref && (
                <Link href={centerHref} className="inline-flex min-h-11 items-center rounded-xl bg-violet/20 px-4 text-sm font-semibold text-violet-soft hover:bg-violet/30">
                  ★ امتیاز بده
                </Link>
              )}
              <Link href="/battles/new" className="inline-flex min-h-11 items-center rounded-xl bg-surface2 px-4 text-sm font-semibold text-ink hover:bg-surface2/70">
                نبرد بساز
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
