import type { Metadata } from "next";
import DailyBattle from "@/components/home/DailyBattle";

export const metadata: Metadata = {
  title: { absolute: "نبرد روز | سینماگزین" },
  description: "هر روز یک جفت فیلم برای همه؛ رأی بده و نتیجهٔ زنده را ببین.",
  alternates: { canonical: "/battles/daily" },
  robots: { index: false, follow: true },
};

export default function DailyBattlePage() {
  return (
    <main>
      <DailyBattle large />
    </main>
  );
}
