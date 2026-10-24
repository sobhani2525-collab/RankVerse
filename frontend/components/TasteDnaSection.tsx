import TasteDnaCard from "./TasteDnaCard";
import TastePeopleCard from "./TastePeopleCard";
import TasteErasCard from "./TasteErasCard";
import TasteAnchorsCard from "./TasteAnchorsCard";
import TasteDnaEmptyState from "./TasteDnaEmptyState";
import { TasteProfile } from "@/lib/types";

interface TasteDnaSectionProps {
  profile: TasteProfile;
  /** Public profiles don't show the user's anchors. */
  hideAnchors?: boolean;
  /** "other" on a public profile: third-person captions, no owner-only hints. */
  perspective?: "self" | "other";
}

/**
 * Only decides empty-vs-full-grid for a successfully fetched profile --
 * loading/error states are the page's job (same split as the Ratings/
 * Lists sections in app/profile/page.tsx), since this component only
 * ever sees a profile that was actually fetched. contribution_stats is
 * rendered by the page itself, in its activity card, not here. Taste-based
 * recommendations live on the home page ("پیشنهاد برای تو"), not here.
 */
export default function TasteDnaSection({ profile, hideAnchors = false, perspective = "self" }: TasteDnaSectionProps) {
  if (profile.snapshot === null) {
    return <TasteDnaEmptyState />;
  }

  const facets = profile.facets;
  const hasPeople = !!facets && (facets.directors.length > 0 || facets.actors.length > 0);
  const hasEras = !!facets && (facets.decades.length > 0 || facets.countries.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <TasteDnaCard
        snapshot={profile.snapshot}
        dimensions={profile.dimensions}
        confidenceHint={perspective === "self" ? profile.confidence_hint : null}
        insight={profile.insight}
        ratingStyle={profile.rating_style}
        perspective={perspective}
      />

      {(hasPeople || hasEras) && (
        <div className={`grid grid-cols-1 gap-5 ${hasPeople && hasEras ? "lg:grid-cols-2" : ""}`}>
          {hasPeople && <TastePeopleCard directors={facets!.directors} actors={facets!.actors} />}
          {hasEras && <TasteErasCard decades={facets!.decades} countries={facets!.countries} />}
        </div>
      )}

      {!hideAnchors && profile.anchors.length > 0 && <TasteAnchorsCard anchors={profile.anchors} />}
    </div>
  );
}
