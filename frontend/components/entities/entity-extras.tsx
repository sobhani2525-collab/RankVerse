import EntityComments from "@/components/entities/entity-comments";

/**
 * Below the graph on movie and series pages: the discussion.
 */
export default function EntityExtras({
  entityId,
}: {
  entityId: string;
}) {
  return (
    <div className="mt-16 flex flex-col gap-14">
      <section aria-label="نقد و بررسی‌ها" className="max-w-3xl">
        <EntityComments entityId={entityId} heading={{ en: "REVIEWS", fa: "نقد و بررسی‌ها" }} />
      </section>
    </div>
  );
}
