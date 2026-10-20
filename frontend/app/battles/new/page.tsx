import { Suspense } from "react";
import type { Metadata } from "next";
import BattleWizard from "@/components/tournament/BattleWizard";

export const metadata: Metadata = {
  title: "ساخت نبرد جدید",
  robots: { index: false, follow: false },
};

export default function NewBattlePage() {
  return (
    <Suspense fallback={<div className="px-4 py-16 text-center text-muted">در حال بارگذاری…</div>}>
      <BattleWizard />
    </Suspense>
  );
}
