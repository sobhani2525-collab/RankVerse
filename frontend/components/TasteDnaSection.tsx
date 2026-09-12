import TasteDnaCard from "./TasteDnaCard";
import TasteInsightCard from "./TasteInsightCard";
import TasteAnchorsCard from "./TasteAnchorsCard";
import TastePredictedPicksCard from "./TastePredictedPicksCard";
import TasteContributionCard from "./TasteContributionCard";
import TasteDnaEmptyState from "./TasteDnaEmptyState";
import { TasteProfile, PredictedPick } from "@/lib/types";

interface TasteDnaSectionProps {
  profile: TasteProfile;
  predictedPicks?: PredictedPick[];
}

/**
 * Only decides empty-vs-full-grid for a successfully fetched profile --
 * loading/error states are the page's job (same split as the Ratings/
 * Lists sections in app/profile/page.tsx), since this component only
 * ever sees a profile that was actually fetched.
 */
export default function TasteDnaSection({ profile, predictedPicks = [] }: TasteDnaSectionProps) {
  const hasSnapshot = profile.snapshot !== null;

  if (!hasSnapshot) {
    return (
      <>
        <TasteDnaEmptyState />
        {profile.contribution_stats && (
          <div className="mt-4">
            <TasteContributionCard stats={profile.contribution_stats} />
          </div>
        )}
      </>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <TasteDnaCard snapshot={profile.snapshot!} dimensions={profile.dimensions} />
      {profile.insight && <TasteInsightCard insight={profile.insight} />}
      {profile.anchors.length > 0 && <TasteAnchorsCard anchors={profile.anchors} />}
      {predictedPicks.length > 0 && <TastePredictedPicksCard picks={predictedPicks} />}
      {profile.contribution_stats && (
        <TasteContributionCard stats={profile.contribution_stats} />
      )}
    </div>
  );
}
