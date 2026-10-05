import Image from "next/image";
import EntityComments from "@/components/entities/entity-comments";
import TrailerPlayer from "@/components/entities/trailer-player";
import { MonoLabel } from "@/components/list-detail/ui";
import type { CastMember } from "@/lib/types";

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
 * Below the graph on movie and series pages: trailer, the rest of the billed
 * cast, and the discussion. Each block only renders when it has something.
 */
export default function EntityExtras({
  entityId,
  title,
  trailerKey,
  moreCast,
}: {
  entityId: string;
  title: string;
  trailerKey: string | null;
  moreCast: CastMember[];
}) {
  return (
    <div className="mt-16 flex flex-col gap-14">
      {trailerKey && (
        <section aria-label="تریلر" className="max-w-3xl">
          <Heading en="TRAILER" fa="تریلر" />
          <TrailerPlayer youtubeKey={trailerKey} title={title} />
        </section>
      )}

      {moreCast.length > 0 && (
        <section aria-label="سایر بازیگران">
          <Heading en="FULL CAST" fa="سایر بازیگران" />
          <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {moreCast.map((m, i) => (
              <li key={`${m.name}-${i}`} className="flex items-center gap-3">
                <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface2 text-sm text-muted">
                  {m.image_url ? (
                    <Image src={m.image_url} alt="" fill sizes="48px" className="object-cover" />
                  ) : (
                    m.name.charAt(0)
                  )}
                </span>
                <span className="min-w-0">
                  <span dir="auto" className="block truncate text-sm text-ink">
                    {m.name}
                  </span>
                  {m.character && (
                    <span dir="auto" className="block truncate text-xs text-muted">
                      {m.character}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="نظرات" className="max-w-3xl">
        <EntityComments entityId={entityId} />
      </section>
    </div>
  );
}
