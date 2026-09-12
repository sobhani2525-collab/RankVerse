import TasteDnaCard from "./TasteDnaCard";
import TasteInsightCard from "./TasteInsightCard";
import TasteAnchorsCard from "./TasteAnchorsCard";
import TasteContributionCard from "./TasteContributionCard";
import TasteDnaEmptyState from "./TasteDnaEmptyState";
import { TasteProfile } from "@/lib/types";

interface TasteDnaSectionProps {
  profile: TasteProfile;
}

export default function TasteDnaSection({ profile }: TasteDnaSectionProps) {
  const hasSnapshot = profile.snapshot !== null;

  return (
    <section className="mx-auto mt-10 max-w-2xl px-6">
      <h2 className="mb-4 text-sm text-muted">Taste DNA</h2>

      {!hasSnapshot && (
        <>
          <TasteDnaEmptyState />
          {profile.contribution_stats && (
            <div className="mt-4">
              <TasteContributionCard stats={profile.contribution_stats} />
            </div>
          )}
        </>
      )}

      {hasSnapshot && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TasteDnaCard snapshot={profile.snapshot!} dimensions={profile.dimensions} />
          {profile.insight && <TasteInsightCard insight={profile.insight} />}
          {profile.anchors.length > 0 && <TasteAnchorsCard anchors={profile.anchors} />}
          {profile.contribution_stats && (
            <TasteContributionCard stats={profile.contribution_stats} />
          )}
        </div>
      )}
    </section>
  );
}
