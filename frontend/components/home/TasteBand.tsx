"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { getMyPredictedPicks } from "@/lib/api";
import { PredictedPick } from "@/lib/types";
import { genreLabel } from "@/lib/genre-labels";
import { displayTitle } from "@/lib/title";
import { detailPathFor } from "@/lib/entity-routes";

const SHOWN = 5;

/** «به سلیقه‌ات می‌خورد»: liked genres as chips and a row of poster picks, no heart buttons. Signed-in only. */
export default function TasteBand() {
  const { isAuthenticated, loading: authLoading, getToken } = useAuth();
  const [picks, setPicks] = useState<PredictedPick[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    getMyPredictedPicks(token, SHOWN)
      .then((p) => !cancelled && setPicks(p))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, getToken]);

  if (!isAuthenticated || failed || (picks && picks.length === 0)) return null;
  const genres = [...new Set((picks ?? []).flatMap((p) => p.reason_genres ?? []))].slice(0, 5);

  return (
    <section className="border-b border-border/60 bg-[#101330]" aria-label="به سلیقه‌ات می‌خورد">
      <div className="mx-auto grid max-w-7xl gap-5 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <div>
          <p className="text-xs text-teal">برای تو · FOR YOU</p>
          <h2 className="mt-1 text-lg font-bold text-ink">به سلیقه‌ات می‌خورد</h2>
          {genres.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {genres.map((g) => (
                <span key={g} className="rounded-xl border border-teal/40 px-3 py-1 text-xs text-teal">{genreLabel(g)}</span>
              ))}
            </div>
          )}
          <Link href="/profile" className="mt-4 inline-block min-h-11 text-sm font-bold text-violet-soft hover:underline">
            DNA سلیقه ←
          </Link>
        </div>
        <ul className="flex snap-x gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-5 lg:overflow-visible">
          {picks === null
            ? Array.from({ length: SHOWN }, (_, i) => <li key={i} className="aspect-[2/3] w-[120px] shrink-0 animate-pulse rounded-2xl bg-surface2/60 lg:w-auto" />)
            : picks.map(({ entity }) => (
                <li key={entity.id} className="w-[120px] shrink-0 snap-start lg:w-auto">
                  <Link href={detailPathFor(entity.entity_type, entity.slug) ?? "#"} className="block">
                    <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-surface2">
                      {entity.poster_path && (
                        <Image src={`https://image.tmdb.org/t/p/w342${entity.poster_path}`} alt="" fill sizes="(max-width: 1024px) 120px, 200px" loading="lazy" className="object-cover" />
                      )}
                    </div>
                    <p className="mt-2 line-clamp-1 text-xs text-ink-dim">{displayTitle(entity)}</p>
                  </Link>
                </li>
              ))}
        </ul>
      </div>
    </section>
  );
}
