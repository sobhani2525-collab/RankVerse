"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { PairSuggestion, PairSuggestionEntity, getPairSuggestion } from "@/lib/api";
import { tournamentApi, tournamentHref } from "@/lib/tournament";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";

const poster = (e: PairSuggestionEntity) => (e.poster_path ? `https://image.tmdb.org/t/p/w185${e.poster_path}` : null);

/** «Make a battle from your ratings»: two titles you scored the same, a VS, and rivals from the graph. */
export default function SuggestedPairCard() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading, getToken } = useAuth();
  const [data, setData] = useState<PairSuggestion | null>(null);
  const [rival, setRival] = useState<PairSuggestionEntity | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none" | "error">("loading");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return setState("none");
    setState("loading");
    try {
      const next = await getPairSuggestion(token);
      setData(next);
      setRival(next?.rivals[0] ?? null);
      setState(next ? "ready" : "none");
    } catch {
      setState("error");
    }
  }, [getToken]);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) return setState("none");
    void load();
  }, [authLoading, isAuthenticated, load]);

  if (state === "none") return null;
  if (state === "loading") return <div className="mt-4 h-56 animate-pulse rounded-3xl bg-surface2/50" aria-busy="true" />;
  if (state === "error" || !data) {
    return (
      <p role="alert" className="mt-4 text-sm text-muted">
        پیشنهاد ساخت نبرد دریافت نشد. <button type="button" onClick={() => void load()} className="underline">تلاش دوباره</button>
      </p>
    );
  }

  // The second film's slot shows the picked rival; a battle needs 4 entries, so publish uses the pair + two rivals.
  const second = rival ?? data.right;
  const others = data.rivals.filter((r) => r.id !== rival?.id);
  const canPublish = data.rivals.length >= 2;

  async function publish() {
    const token = getToken();
    if (!token || !data || publishing) return;
    setPublishing(true);
    setError(null);
    try {
      const ids = [data.left, second, data.right, ...data.rivals]
        .map((e) => e.id)
        .filter((id, i, all) => all.indexOf(id) === i)
        .slice(0, 4);
      const { slug } = await tournamentApi.create(token, {
        title: `${displayTitle(data.left)} یا ${displayTitle(second)}؟`,
        entity_type: data.category as "movie" | "tv_series",
        bracket_size: 4,
      });
      await tournamentApi.setEntries(token, slug, ids);
      await tournamentApi.publish(token, slug, { visibility: "public" });
      router.push(tournamentHref(slug));
    } catch (e) {
      setError(e instanceof Error ? e.message : "انتشار ممکن نشد");
      setPublishing(false);
    }
  }

  return (
    <section className="rounded-3xl border border-dashed border-[#a99bff]/50 p-5" aria-label="پیشنهاد ساخت نبرد">
      <p className="text-xs font-bold text-[#a99bff]">پیشنهاد ساخت نبرد، از سلیقهٔ تو</p>
      <div className="mt-4 flex flex-wrap items-center gap-5">
        <div className="relative flex items-center gap-3">
          {[data.left, second].map((e) => (
            <div key={e.id} className="w-[110px] text-center">
              <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-surface2">
                {poster(e) && <Image src={poster(e)!} alt="" fill sizes="110px" loading="lazy" className="object-cover" />}
              </div>
              <p className="mt-1 line-clamp-2 text-xs font-medium text-ink">{displayTitle(e)}</p>
            </div>
          ))}
          <span aria-hidden="true" className="absolute left-1/2 top-[40%] -translate-x-1/2 rounded-full border border-violet-soft bg-bg px-2 py-1 text-[10px] font-bold text-violet-soft">VS</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink">هر دو را {toFaDigits(data.score)} ستاره داده‌ای؛ کدام برتر است؟</p>
          {others.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-muted">حریف دیگر از گراف</p>
              <div className="mt-2 flex gap-2">
                {data.rivals.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRival(r)}
                    aria-pressed={rival?.id === r.id}
                    aria-label={`حریف: ${displayTitle(r)}`}
                    className={`relative h-[93px] w-[65px] overflow-hidden rounded-lg bg-surface2 focus-visible:outline-gold ${rival?.id === r.id ? "ring-2 ring-violet-soft" : "opacity-70"}`}
                  >
                    {poster(r) && <Image src={poster(r)!} alt="" fill sizes="44px" loading="lazy" className="object-cover" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-xs text-gold">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {canPublish ? (
          <button type="button" onClick={publish} disabled={publishing} className="min-h-11 rounded-xl bg-gradient-to-l from-[#a99bff] to-[#5fd8bf] px-6 text-sm font-extrabold text-[#0b0d1c] disabled:opacity-60">
            {publishing ? "در حال انتشار…" : "منتشر کن"}
          </button>
        ) : (
          <Link href="/battles/new" className="btn-primary inline-flex min-h-11 items-center rounded-xl px-5 text-sm">ساخت نبرد</Link>
        )}
        <button type="button" onClick={() => void load()} className="min-h-11 rounded-xl border border-border bg-surface2 px-4 text-sm font-semibold text-ink">
          جفت دیگر
        </button>
        <Link href="/battles/new" className="text-xs text-muted hover:text-ink">ساخت نبرد از صفر ←</Link>
      </div>
    </section>
  );
}
