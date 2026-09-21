import { getListsContainingEntity } from "@/lib/api";
import ListCard from "@/components/lists/list-card";
import { listSummaryToListCard } from "@/lib/entity-card-adapters";

export default async function EntityLists({ entityId }: { entityId: string }) {
  let lists;
  try {
    lists = await getListsContainingEntity(entityId);
  } catch {
    return null;
  }

  if (!lists.length) return null;

  return (
    <div className="mt-10">
      <h2 className="text-lg font-bold text-ink">لیست‌های مرتبط</h2>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
        {lists.map((list) => (
          <ListCard key={list.id} list={listSummaryToListCard(list)} />
        ))}
      </div>
    </div>
  );
}
