"use client";
import { SwordsIcon } from "@/components/list-detail/icons";

export const ENTITY_BATTLE_SECTION_ID = "entity-battle";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Smooth-scrolls to the in-page battle section -- same violet "نبرد" jump
 *  pattern as the list detail page's BattleJumpButton, just anchored to a
 *  page section id instead of the list-battle context's start(index). */
export default function BattleJumpButton({ label = "نبرد با فیلم مشابه" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        document.getElementById(ENTITY_BATTLE_SECTION_ID)?.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "start",
        });
      }}
      className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-violet-strong/60 bg-violet/15 px-4 backdrop-blur-md text-sm font-bold text-violet-light transition hover:border-violet-light hover:bg-violet/25"
    >
      <SwordsIcon size={18} />
      {label}
    </button>
  );
}
