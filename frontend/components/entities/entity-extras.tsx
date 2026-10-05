import EntityComments from "@/components/entities/entity-comments";
import TrailerPlayer from "@/components/entities/trailer-player";
import { MonoLabel } from "@/components/list-detail/ui";

function Heading({ en, fa }: { en: string; fa: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <MonoLabel size="text-[10px]" className="text-dim">
        {en}
      </MonoLabel>
      <span className="text-sm text-muted">{fa}</span>
    </div>
  );
}

/**
 * Below the graph on movie and series pages: trailer and the discussion. Each block only renders when it has something.
 */
export default function EntityExtras({
  entityId,
  title,
  trailerKey,
}: {
  entityId: string;
  title: string;
  trailerKey: string | null;
}) {
  return (
    <div className="mt-16 flex flex-col gap-14">
      {trailerKey && (
        <section aria-label="تریلر" className="max-w-3xl">
          <Heading en="TRAILER" fa="تریلر" />
          <TrailerPlayer youtubeKey={trailerKey} title={title} />
        </section>
      )}

      <section aria-label="نظرات" className="max-w-3xl">
        <EntityComments entityId={entityId} />
      </section>
    </div>
  );
}
