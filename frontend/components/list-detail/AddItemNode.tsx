"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { addListItem, getListCandidates } from "@/lib/api";
import type { ListCandidate, ListItem } from "@/lib/types";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { candidateReason, entityPosterUrl, typeLabel, withAppendedItem, withoutItem } from "@/lib/list-constellation";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useListViewer } from "./ListViewerContext";
import { MonoLabel } from "./ui";
import { CheckIcon, CloseIcon, PlusIcon, SearchIcon } from "./icons";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The ListItem shown on the spine while the real one is being saved. */
function optimisticItem(candidate: ListCandidate, items: ListItem[]): ListItem {
  return {
    id: `temp-${candidate.entity.id}`,
    position: Math.max(0, ...items.map((i) => i.position)) + 1,
    note: null,
    added_at: new Date().toISOString(),
    added_by_user_id: "",
    like_score: null,
    like_count: 0,
    dislike_count: 0,
    is_own: true,
    can_remove: true,
    my_vote: null,
    entity: candidate.entity,
    year: candidate.year,
    director: candidate.director,
    lead_actor: candidate.lead_actor,
    genres: candidate.genres,
    overview: candidate.overview,
    composite_score: null,
  };
}

function Poster({ candidate }: { candidate: ListCandidate }) {
  const src = entityPosterUrl(candidate.entity, "w92");
  return (
    <div className="relative h-[66px] w-11 shrink-0 overflow-hidden rounded-md border border-border bg-surface-2">
      {src ? (
        <Image src={src} alt="" fill sizes="44px" className="object-cover" />
      ) : (
        <span dir="ltr" className="absolute inset-0 flex items-end bg-gradient-to-br from-surface-2 to-bg p-1 text-left font-mono text-[7px] text-dim">
          {candidate.entity.title}
        </span>
      )}
    </div>
  );
}

/**
 * The add-item node at the end of the spine. Closed: a dashed "+" ring and
 * a button card. Open: a card with a debounced search across every entity
 * type and the candidates (GET /lists/{slug}/candidates) -- graph
 * suggestions while the query is empty -- each saying how it would connect
 * to the list. Each candidate is a checkbox, so several can be ticked (the
 * ticks survive a new search) and added at once: they join the end right
 * away (the spine animates them in), then save one by one in tick order; a
 * failed save rolls that item back.
 */
export default function AddItemNode({
  open,
  onOpen,
  onClose,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { getToken } = useAuth();
  const { slug, detail, setItemsDetail, markJustAdded, refresh } = useListViewer();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 350);
  const [candidates, setCandidates] = useState<ListCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ticked candidates by entity id, in tick order (a Map keeps insertion order).
  const [selected, setSelected] = useState<Map<string, ListCandidate>>(new Map());
  const rootRef = useRef<HTMLDivElement>(null);
  const nextRank = detail.items.length + 1;

  useEffect(() => {
    if (open) {
      rootRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    setCandidates(null);
    getListCandidates(token, slug, debouncedQuery)
      .then((rows) => {
        if (!cancelled) setCandidates(rows);
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, debouncedQuery, slug, getToken]);

  const rows = useMemo(() => {
    const inList = new Set(detail.items.map((i) => i.entity.id));
    return (candidates ?? [])
      .filter((c) => !inList.has(c.entity.id))
      .map((candidate) => ({ candidate, reason: candidateReason(candidate, detail.items) }))
      .sort((a, b) => b.reason.strength - a.reason.strength);
  }, [candidates, detail.items]);

  function close() {
    setQuery("");
    setSelected(new Map());
    onClose();
  }

  function toggle(candidate: ListCandidate) {
    setSelected((current) => {
      const next = new Map(current);
      if (!next.delete(candidate.entity.id)) next.set(candidate.entity.id, candidate);
      return next;
    });
  }

  async function addSelected() {
    const token = getToken();
    const chosen = [...selected.values()];
    if (!token || chosen.length === 0) return;
    setError(null);

    // Show them all on the spine first; each temp id is swapped for the real one once saved.
    let base = detail.items;
    const temps = chosen.map((candidate) => {
      const temp = optimisticItem(candidate, base);
      base = [...base, temp];
      return temp;
    });
    setItemsDetail((current) => temps.reduce(withAppendedItem, current));
    markJustAdded(chosen[0].entity.id);
    close();

    const failed: string[] = [];
    for (const [index, candidate] of chosen.entries()) {
      const temp = temps[index];
      try {
        const saved = await addListItem(token, slug, { entity_id: candidate.entity.id });
        setItemsDetail((current) => ({
          ...current,
          items: current.items.map((i) => (i.id === temp.id ? { ...i, id: saved.id, position: saved.position } : i)),
        }));
      } catch {
        failed.push(temp.id);
        setItemsDetail((current) => withoutItem(current, temp.id));
      }
    }
    if (failed.length > 0) {
      setError(
        failed.length === chosen.length
          ? "افزودن آیتم انجام نشد. دوباره تلاش کن."
          : `${toFaDigits(failed.length)} آیتم اضافه نشد. دوباره تلاش کن.`
      );
    }
    // Let the server recompute every edge/backlink (it sees all directors and top-billed cast).
    refresh();
  }

  const ring = (
    <div className="flex w-9 shrink-0 justify-center lg:w-[52px]" aria-hidden="true">
      <div className="flex h-9 w-9 items-center justify-center rounded-full border-[1.5px] border-dashed border-[#4CC9A6] bg-bg text-[#4CC9A6] lg:h-12 lg:w-12">
        <PlusIcon size={16} />
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className="flex scroll-mt-20 gap-3 lg:gap-6">
      {ring}

      {!open ? (
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="flex min-h-16 w-full flex-col items-start gap-0.5 rounded-2xl border border-dashed border-[#2C4A48] bg-transparent px-4 py-3.5 text-start transition-[border-color,background-color] duration-[160ms] hover:border-[#4CC9A6] hover:bg-[rgba(76,201,166,0.05)] lg:rounded-[18px]"
          >
            <MonoLabel size="text-[10px]" className="text-[#4CC9A6]">
              ADD NODE
            </MonoLabel>
            <span className="text-[15px] font-extrabold text-ink">افزودن آیتم به انتهای لیست</span>
          </button>
          {error && (
            <p className="text-xs text-[#F07178]" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="rv-card-in flex min-w-0 flex-1 flex-col gap-3.5 rounded-2xl border border-dashed border-[#2C4A48] bg-[#0C1119] p-4 lg:rounded-[18px] lg:p-[22px]">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col items-start gap-0.5 text-start">
              <MonoLabel size="text-[10px]" className="text-[#4CC9A6]">
                ADD NODE
              </MonoLabel>
              <span className="text-base font-extrabold text-ink">
                افزودن آیتم #<span className="num">{toFaDigits(nextRank)}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="بستن"
              className="-me-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-xl text-muted transition hover:text-ink"
            >
              <CloseIcon size={18} />
            </button>
          </div>

          <label className="flex h-[46px] items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 text-dim focus-within:border-[#4CC9A6]/60">
            <SearchIcon size={18} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="عنوان فیلم، سریال یا شخص"
              aria-label="جستجوی عنوان"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-dim"
            />
          </label>

          {/* Persian stays out of MonoLabel: its letter-spacing breaks Persian joining. */}
          <div className="flex items-center gap-2">
            <MonoLabel size="text-[10px]" className="text-dim">
              {debouncedQuery ? "RESULTS" : "GRAPH SUGGESTS"}
            </MonoLabel>
            <span className="text-xs text-muted">{debouncedQuery ? "نتایج" : "پیشنهاد گراف"}</span>
          </div>

          {candidates === null ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5 text-[13px] text-[#4CC9A6]">
                <span
                  className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#4CC9A6]/25 border-t-[#4CC9A6]"
                  aria-hidden="true"
                />
                <span>
                  {debouncedQuery
                    ? "در حال جستجو…"
                    : "گراف دارد از روی آیتم‌های لیستت پیشنهاد می‌سازد… (چند ثانیه صبر کن)"}
                </span>
              </div>
              <ul className="flex flex-col gap-2" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <li
                    key={i}
                    style={{ opacity: 1 - i * 0.25 }}
                    className="flex animate-pulse items-center gap-3 rounded-xl border border-border-soft bg-surface p-2.5"
                  >
                    <span className="h-6 w-6 shrink-0 rounded-md bg-surface-2" />
                    <span className="h-[66px] w-11 shrink-0 rounded-md bg-surface-2" />
                    <div className="flex flex-1 flex-col gap-2">
                      <span className="h-3.5 w-2/3 rounded bg-surface-2" />
                      <span className="h-3 w-1/4 rounded bg-surface-2" />
                      <span className="h-3 w-1/2 rounded bg-surface-2" />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-[13px] text-dim">نتیجه‌ای پیدا نشد.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map(({ candidate, reason }) => {
                const title = displayTitle(candidate.entity);
                const checked = selected.has(candidate.entity.id);
                return (
                  <li key={candidate.entity.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 transition-[border-color,background-color] duration-[160ms] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#4CC9A6]/50 ${
                        checked
                          ? "border-[#4CC9A6] bg-[rgba(76,201,166,0.07)]"
                          : "border-border-soft bg-surface hover:border-[#2C4A48]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(candidate)}
                        aria-label={`انتخاب ${title}`}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-[1.5px] transition-[background-color,border-color] duration-[160ms] ${
                          checked ? "border-[#4CC9A6] bg-[#4CC9A6] text-bg" : "border-border text-transparent"
                        }`}
                      >
                        <CheckIcon size={14} />
                      </span>
                      <Poster candidate={candidate} />
                      <div className="flex min-w-0 flex-1 flex-col items-start gap-1 text-start">
                        <span className="text-sm font-extrabold leading-[1.5] text-ink">{title}</span>
                        <div className="flex items-center gap-1.5">
                          <MonoLabel size="text-[9px]" className="text-gold">
                            {typeLabel(candidate.entity.entity_type).en}
                          </MonoLabel>
                          {candidate.year ? (
                            <span className="num rounded-full border border-border bg-surface-2 px-2 text-[11px] font-bold text-ink">
                              {toFaDigits(candidate.year)}
                            </span>
                          ) : null}
                        </div>
                        <span className={`text-xs leading-[1.6] ${reason.tone}`}>{reason.text}</span>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {selected.size > 0 && (
            <div className="sticky bottom-3 z-10 flex items-center gap-2 rounded-xl border border-[#4CC9A6]/40 bg-[#0C1119]/95 p-2 shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur">
              <button
                type="button"
                onClick={addSelected}
                className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-[#4CC9A6] bg-[rgba(76,201,166,0.15)] px-3 text-sm font-extrabold text-[#4CC9A6] transition-[background-color] duration-[160ms] hover:bg-[rgba(76,201,166,0.25)]"
              >
                <PlusIcon size={18} />
                <span>
                  افزودن <span className="num">{toFaDigits(selected.size)}</span> آیتم
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Map())}
                className="h-11 shrink-0 rounded-xl px-3 text-xs text-muted transition hover:text-ink"
              >
                پاک کردن
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
