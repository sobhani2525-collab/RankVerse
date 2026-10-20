import type { Metadata } from "next";
import BattleRelated from "@/components/tournament/BattleRelated";
import TournamentView from "@/components/tournament/TournamentView";
import { getPublicBattle } from "@/lib/tournament-server";
import { absoluteUrl, excerpt } from "@/lib/site";

type Params = { params: Promise<{ slug: string }> };

// Next 15: params is a Promise.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const battle = await getPublicBattle(slug);
  if (!battle) return { title: "نبرد تورنمنتی", robots: { index: false, follow: false } };
  const description = excerpt(battle.description || `نبرد ${battle.bracket_size} گزینه‌ای «${battle.title}»؛ رأی بده تا قهرمان مشخص شود.`);
  return {
    title: battle.title,
    description,
    alternates: { canonical: absoluteUrl(`/battles/${battle.slug}`) },
    // unlisted battles are shareable by link but stay out of search results
    robots: battle.visibility === "public" ? undefined : { index: false, follow: false },
    openGraph: { title: battle.title, description, type: "website" },
  };
}

// The battle itself is read client-side (it depends on the viewer: drafts, own
// votes, is_owner) and polled while active.
export default async function BattlePage({ params }: Params) {
  const { slug } = await params;
  return (
    <>
      <TournamentView slug={slug} />
      <BattleRelated slug={slug} />
    </>
  );
}
