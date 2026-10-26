"use client";
import { useCallback, useMemo, useState } from "react";
import type { MovieListItem } from "@/lib/types";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { absoluteUrl } from "@/lib/site";
import { entityHref } from "@/lib/list-constellation";
import { SectionHeading } from "@/components/list-detail/ui";
import WinnerStaysBattle, { WinnerStaysItem } from "@/components/battle/WinnerStaysBattle";
import { ENTITY_BATTLE_SECTION_ID } from "@/components/entities/battle-jump-button";

/**
 * The movie / series page's BATTLE section, drawn with the same "winner stays"
 * piece as /battles/*: it always opens with the title of the page as the first
 * champion, facing its siblings (same type, weakest first).
 */
export default function EntityBattle({
  current,
  opponents,
  label,
}: {
  current: MovieListItem;
  opponents: MovieListItem[];
  label: string;
}) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { openLoginModal } = useAuthGate();
  const [runId, setRunId] = useState(0);
  const [runDone, setRunDone] = useState(false);
  const markDone = useCallback(() => setRunDone(true), []);

  const items: WinnerStaysItem[] = useMemo(() => {
    const sameType = opponents.filter((o) => o.id !== current.id && o.entity_type === current.entity_type);
    const scored = sameType.filter((o) => o.computed_score != null);
    const pool = scored.length >= 1 ? scored : sameType;
    const sorted = [...pool].sort((a, b) => (a.computed_score ?? 0) - (b.computed_score ?? 0));
    return [current, ...sorted].map((i) => ({
      id: i.id,
      slug: i.slug,
      title: i.title,
      title_fa: i.title_fa,
      entity_type: i.entity_type,
      poster_path: i.poster_path,
      image_url: i.media?.image_url ?? null,
      year: i.year,
    }));
  }, [current, opponents]);

  if (items.length < 2) return null;

  const pagePath = entityHref(current.entity_type, current.slug) ?? `/movies/${current.slug}`;

  return (
    <section id={ENTITY_BATTLE_SECTION_ID} aria-labelledby="entity-battle-heading" className="flex scroll-mt-24 flex-col gap-5">
      <div id="entity-battle-heading">
        <SectionHeading en="BATTLE" fa={runDone ? "برندهٔ نبرد" : "کدام بهتر است؟"} tone="text-violet-light" />
      </div>
      <WinnerStaysBattle
        key={runId}
        items={items}
        category={current.entity_type}
        signedIn={!authLoading && isAuthenticated}
        reason={`${label} · با این اثر شروع می‌شود`}
        share={{ url: absoluteUrl(pagePath), topic: label, battleName: label }}
        onDone={markDone}
        onNext={() => {
          setRunDone(false);
          setRunId((n) => n + 1);
        }}
      />
      {!authLoading && !isAuthenticated && !runDone && (
        <div className="flex flex-col items-center gap-2 text-center">
          <button type="button" onClick={openLoginModal} className="btn-primary text-sm hover:opacity-90">
            ورود
          </button>
          <p className="text-xs text-muted">برای ثبت انتخاب‌هایت در رتبه‌بندی باید وارد شوی.</p>
        </div>
      )}
    </section>
  );
}
