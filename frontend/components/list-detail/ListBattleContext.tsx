"use client";
import { createContext, useCallback, useContext, useState } from "react";
import type { ListItem } from "@/lib/types";
import { battleOpponents } from "@/lib/list-constellation";
import { useListViewer } from "./ListViewerContext";

/** id of the BATTLE section the item "نبرد" buttons scroll to. */
export const LIST_BATTLE_ID = "list-battle";

interface ListBattleState {
  /** Index (into items) of the item every opponent faces. */
  anchor: number;
  /** Bumped on every start() so re-anchoring the same item still restarts. */
  runId: number;
  start: (index: number) => void;
}

const ListBattleContext = createContext<ListBattleState | null>(null);

/**
 * Client-side state for the list page's in-page battle, shared between
 * each item's "نبرد" button and the BATTLE section. Only the individual
 * votes reach the backend; the run itself lives here. Reads the same live
 * items as the spine (ListViewerContext), so indexes match what's shown.
 */
export function ListBattleProvider({ children }: { children: React.ReactNode }) {
  const { detail } = useListViewer();
  const [anchor, setAnchor] = useState(() => defaultAnchor(detail.items));
  const [runId, setRunId] = useState(0);

  const start = useCallback((index: number) => {
    setAnchor(index);
    setRunId((n) => n + 1);
    const section = document.getElementById(LIST_BATTLE_ID);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    section?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, []);

  return <ListBattleContext.Provider value={{ anchor, runId, start }}>{children}</ListBattleContext.Provider>;
}

export function useListBattle(): ListBattleState {
  const ctx = useContext(ListBattleContext);
  if (!ctx) throw new Error("useListBattle must be used inside ListBattleProvider");
  return ctx;
}

/** Item #1, unless it has nobody to battle -- then the first item that does. */
function defaultAnchor(items: ListItem[]): number {
  const index = items.findIndex((_, i) => battleOpponents(items, i).length > 0);
  return index === -1 ? 0 : index;
}

/** The anchor after `current` (wrapping) that has at least one opponent. */
export function nextAnchor(items: ListItem[], current: number): number {
  for (let step = 1; step <= items.length; step++) {
    const index = (current + step) % items.length;
    if (battleOpponents(items, index).length > 0) return index;
  }
  return current;
}
