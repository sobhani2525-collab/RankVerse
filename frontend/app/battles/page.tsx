"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import SectionHeading from "@/components/home/SectionHeading";
import { BattleArenaBody } from "@/components/home/BattleArena";

export default function BattlesPage() {
  // useSearchParams needs a Suspense boundary (this page is otherwise
  // statically prerendered) -- only BattlesPageInner actually reads it.
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted">در حال بارگذاری…</div>}>
      <BattlesPageInner />
    </Suspense>
  );
}

/** Same battle as the home page's arena. A SuggestedBattleCard's "شروع نبرد"
 *  link (/battles?category=…&left_id=…&right_id=…) opens the run with that pair. */
function BattlesPageInner() {
  const searchParams = useSearchParams();
  const leftId = searchParams.get("left_id");
  const rightId = searchParams.get("right_id");
  const preselected = leftId && rightId ? { category: searchParams.get("category") || "movie", leftId, rightId } : null;

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <SectionHeading
        center
        kicker="Let the movies fight"
        title="بگذار فیلم‌ها بجنگند."
        lead="از هر جفت، یکی را انتخاب کن. برنده می‌ماند و با فیلم بعدی روبه‌رو می‌شود."
      />
      <BattleArenaBody preselected={preselected} />
    </main>
  );
}
