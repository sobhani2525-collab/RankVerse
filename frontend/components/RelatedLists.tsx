import { getRelatedLists } from "@/lib/api";
import ListCard from "@/components/lists/list-card";
import { listSummaryToListCard } from "@/lib/entity-card-adapters";

export default async function RelatedLists({ slug }: { slug: string }) {
  let related;
  try {
    related = await getRelatedLists(slug);
  } catch {
    return null;
  }

  if (!related.length) return null;

  return (
    <div className="mt-10">
      <h2 className="text-lg font-bold text-ink">لیست‌های مشابه</h2>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-6">
        {related.map((list) => (
          <ListCard key={list.id} list={listSummaryToListCard(list)} />
        ))}
      </div>
    </div>
  );
}
