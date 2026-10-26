"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAuthGate } from "@/contexts/AuthGateContext";
import type { MovieListItem } from "@/lib/types";
import { absoluteUrl } from "@/lib/site";
import { SectionHeading } from "@/components/list-detail/ui";
import WinnerStaysBattle, { WinnerStaysItem } from "@/components/battle/WinnerStaysBattle";

interface Domain {
  key: string;
  label: string;
  items: MovieListItem[];
  /** Replaces the default "از ضعیف‌ترین" hint under the heading. */
  note?: string;
}

// With this many credits or fewer the run covers all of them at once;
// above it every run sticks to one randomly chosen field.
const FEW_CREDITS = 12;

/** Weakest first. Unscored titles only count when fewer than two are scored. */
function battleOrder(items: MovieListItem[]): MovieListItem[] {
  // A vote's category is the entity type, so a run stays within one type
  // (the larger group of the credits).
  const byType = new Map<string, MovieListItem[]>();
  for (const item of items) byType.set(item.entity_type, [...(byType.get(item.entity_type) ?? []), item]);
  const group = [...byType.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  const scored = group.filter((i) => i.computed_score != null);
  const pool = scored.length >= 2 ? scored : group;
  return [...pool].sort((a, b) => (a.computed_score ?? 0) - (b.computed_score ?? 0));
}

function buildDomains(directed: MovieListItem[], created: MovieListItem[], actedIn: MovieListItem[]): Domain[] {
  const unique = [...new Map([...directed, ...created, ...actedIn].map((i) => [i.id, i])).values()];
  if (unique.length <= FEW_CREDITS) {
    const items = battleOrder(unique);
    return items.length >= 2 ? [{ key: "all", label: "آثار", items }] : [];
  }
  return [
    { key: "directed", label: "کارگردانی‌ها", items: directed },
    { key: "created", label: "ساخته‌ها", items: created },
    { key: "acted", label: "بازیگری‌ها", items: actedIn },
  ]
    .map((d) => ({ ...d, items: battleOrder(d.items) }))
    .filter((d) => d.items.length >= 2);
}

/**
 * The person page's BATTLE section, drawn with the same "winner stays" piece
 * as /battles/*: the run starts from the person's weakest titles and the
 * winner of each pair faces the next-weakest until one final winner is left.
 * A person with many credits battles within one randomly picked field
 * (acting, directing...) per run. Each tap is cast as a normal /battles vote.
 */
export default function PersonBattle({
  directed,
  created,
  actedIn,
  personName,
}: {
  directed: MovieListItem[];
  created: MovieListItem[];
  actedIn: MovieListItem[];
  personName: string;
}) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { openLoginModal } = useAuthGate();
  const pathname = usePathname();
  const domains = useMemo(() => buildDomains(directed, created, actedIn), [directed, created, actedIn]);
  // Picked after mount so server and client markup agree.
  const [pick, setPick] = useState<{ index: number; runId: number } | null>(null);
  const [runDone, setRunDone] = useState(false);
  const markDone = useCallback(() => setRunDone(true), []);

  useEffect(() => {
    setPick(domains.length ? { index: Math.floor(Math.random() * domains.length), runId: 0 } : null);
  }, [domains]);

  const domain = pick ? domains[pick.index] : undefined;
  const items: WinnerStaysItem[] = useMemo(
    () =>
      (domain?.items ?? []).map((i) => ({
        id: i.id,
        slug: i.slug,
        title: i.title,
        title_fa: i.title_fa,
        entity_type: i.entity_type,
        poster_path: i.poster_path,
        image_url: i.media?.image_url ?? null,
        year: i.year,
      })),
    [domain]
  );

  if (!pick || !domain) return null;

  function again() {
    setRunDone(false);
    setPick((p) => {
      if (!p) return p;
      let index = Math.floor(Math.random() * domains.length);
      if (domains.length > 1 && index === p.index) index = (index + 1) % domains.length;
      return { index, runId: p.runId + 1 };
    });
  }

  return (
    <section aria-labelledby="person-battle-heading" className="flex scroll-mt-24 flex-col gap-5">
      <div id="person-battle-heading">
        <SectionHeading en="BATTLE" fa={runDone ? "برندهٔ نبرد" : "کدام بهتر است؟"} tone="text-violet-light" />
      </div>
      <WinnerStaysBattle
        key={`${pick.runId}:${domain.key}`}
        items={items}
        category={items[0].entity_type}
        signedIn={!authLoading && isAuthenticated}
        reason={`${personName} · ${domain.label} · ${domain.note ?? "از ضعیف‌ترین"}`}
        share={{ url: absoluteUrl(pathname), topic: personName, battleName: personName }}
        onDone={markDone}
        onNext={again}
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
