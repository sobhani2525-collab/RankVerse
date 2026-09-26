"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { addListItem, getListCandidates } from "@/lib/api";
import type { ListCandidate, ListItem } from "@/lib/types";
import { displayTitle } from "@/lib/title";
import { toFaDigits } from "@/lib/format-number";
import { candidateReason, entityPosterUrl, typeLabel, withAppendedItem } from "@/lib/list-constellation";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useListViewer } from "./ListViewerContext";
import { MonoLabel } from "./ui";
import { CloseIcon, PlusIcon, SearchIcon } from "./icons";

type CandidateType = "movie" | "tv_series";

const TYPE_TABS: { value: CandidateType; label: string }[] = [
  { value: "movie", label: "فیلم" },
  { value: "tv_series", label: "سریال" },
];

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
 * a button card. Open: a card with a movie/series switch, a debounced
 * search and the candidates (GET /lists/{slug}/candidates) -- graph
 * suggestions while the query is empty -- each saying how it would connect
 * to the list. Adding inserts the item at the end right away (the spine
 * animates it in), then saves it; a failed save rolls it back.
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
  const lockedType: CandidateType | null =
    detail.entity_type === "movie" || detail.entity_type === "tv_series" ? detail.entity_type : null;
  const [type, setType] = useState<CandidateType>(lockedType ?? "movie");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 350);
  const [candidates, setCandidates] = useState<ListCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    getListCandidates(token, slug, type, debouncedQuery)
      .then((rows) => {
        if (!cancelled) setCandidates(rows);
      })
      .catch(() => {
        if (!cancelled) setCandidates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, type, debouncedQuery, slug, getToken]);

  const rows = useMemo(() => {
    const inList = new Set(detail.items.map((i) => i.entity.id));
    return (candidates ?? [])
      .filter((c) => !inList.has(c.entity.id))
      .map((candidate) => ({ candidate, reason: candidateReason(candidate, detail.items) }))
      .sort((a, b) => b.reason.strength - a.reason.strength);
  }, [candidates, detail.items]);

  function close() {
    setQuery("");
    onClose();
  }

  async function add(candidate: ListCandidate) {
    const token = getToken();
    if (!token) return;
    const before = detail;
    const temp = optimisticItem(candidate, before.items);
    setError(null);
    setItemsDetail((current) => withAppendedItem(current, temp));
    markJustAdded(candidate.entity.id);
    close();
    try {
      const saved = await addListItem(token, slug, { entity_id: candidate.entity.id });
      setItemsDetail((current) => ({
        ...current,
        items: current.items.map((i) => (i.id === temp.id ? { ...i, id: saved.id, position: saved.position } : i)),
      }));
      // Let the server recompute every edge/backlink (it sees all directors and top-billed cast).
      refresh();
    } catch {
      setItemsDetail((current) => ({
        ...current,
        items: current.items.filter((i) => i.id !== temp.id),
        edges: before.edges,
        backlinks: before.backlinks,
      }));
      setError("افزودن آیتم انجام نشد. دوباره تلاش کن.");
    }
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

          {!lockedType && (
            <div className="flex gap-1 rounded-[10px] border border-border bg-[#0E121C] p-[3px]" role="group" aria-label="نوع آیتم">
              {TYPE_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setType(tab.value)}
                  aria-pressed={type === tab.value}
                  className={`h-[38px] flex-1 rounded-lg text-[13px] font-bold transition-[background-color,color] duration-[160ms] ${
                    type === tab.value ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          <label className="flex h-[46px] items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 text-dim focus-within:border-[#4CC9A6]/60">
            <SearchIcon size={18} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="نام فیلم یا سریال…"
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
            <p className="text-[13px] text-dim">در حال جستجو…</p>
          ) : rows.length === 0 ? (
            <p className="text-[13px] text-dim">نتیجه‌ای پیدا نشد.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map(({ candidate, reason }) => {
                const title = displayTitle(candidate.entity);
                return (
                  <li
                    key={candidate.entity.id}
                    className="flex items-center gap-3 rounded-xl border border-border-soft bg-surface p-2.5"
                  >
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
                    <button
                      type="button"
                      onClick={() => add(candidate)}
                      aria-label={`افزودن ${title}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#4CC9A6] bg-[rgba(76,201,166,0.1)] text-[#4CC9A6] transition-[background-color] duration-[160ms] hover:bg-[rgba(76,201,166,0.2)]"
                    >
                      <PlusIcon size={18} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
