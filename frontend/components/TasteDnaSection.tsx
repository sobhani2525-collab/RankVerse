import { ReactNode } from "react";
import TasteDnaCard from "./TasteDnaCard";
import TasteInsightCard from "./TasteInsightCard";
import TasteAnchorsCard from "./TasteAnchorsCard";
import TastePredictedPicksCard from "./TastePredictedPicksCard";
import TasteDnaEmptyState from "./TasteDnaEmptyState";
import { TasteProfile, PredictedPick } from "@/lib/types";

interface TasteDnaSectionProps {
  profile: TasteProfile;
  predictedPicks?: PredictedPick[];
  /** Rendered right after the "NEXT PICK" gallery and before "TASTE
   *  ANCHORS" -- the page's Watch Later card slots in here (see
   *  app/profile/page.tsx) so it sits between those two, not because this
   *  component owns watch-later data itself. */
  afterPredictedPicks?: ReactNode;
}

/**
 * Only decides empty-vs-full-grid for a successfully fetched profile --
 * loading/error states are the page's job (same split as the Ratings/
 * Lists sections in app/profile/page.tsx), since this component only
 * ever sees a profile that was actually fetched. contribution_stats is
 * rendered by the page itself, merged into its RATINGS stat strip, not
 * here.
 */
export default function TasteDnaSection({ profile, predictedPicks = [], afterPredictedPicks }: TasteDnaSectionProps) {
  const hasSnapshot = profile.snapshot !== null;

  if (!hasSnapshot) {
    return (
      <div className="flex flex-col gap-5">
        <TasteDnaEmptyState />
        {afterPredictedPicks}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Featured row: the DNA ring is the headline card, the AI reading
          sits beside it -- both get real width instead of splitting a
          cramped 2-col grid down the middle. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <TasteDnaCard snapshot={profile.snapshot!} dimensions={profile.dimensions} />
        {profile.insight && <TasteInsightCard insight={profile.insight} />}
      </div>

      {/* Full-width galleries: posters need room to breathe, so these span
          the whole section instead of squeezing into a half column. */}
      {predictedPicks.length > 0 && <TastePredictedPicksCard picks={predictedPicks} />}
      {afterPredictedPicks}
      {profile.anchors.length > 0 && <TasteAnchorsCard anchors={profile.anchors} />}
    </div>
  );
}
