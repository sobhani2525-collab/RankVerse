import type { Metadata } from "next";
import MyBattles from "@/components/tournament/MyBattles";

export const metadata: Metadata = {
  title: "نبردهای من",
  robots: { index: false, follow: false },
};

export default function MyBattlesPage() {
  return <MyBattles />;
}
