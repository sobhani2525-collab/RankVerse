import Link from "next/link";
import ListCard from "@/components/ListCard";
import { discoverLists } from "@/lib/api";

export const revalidate = 60;

export default async function ListsPage() {
  let lists: Awaited<ReturnType<typeof discoverLists>> = [];
  let loadError: string | null = null;

  try {
    lists = await discoverLists({ page_size: 30, sort: "newest" });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "خطا در دریافت اطلاعات";
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">لیست‌های کاربران</h1>
        <Link
          href="/lists/new"
          className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-bg transition hover:bg-gold/90"
        >
          ساخت لیست جدید
        </Link>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-gold/30 bg-gold/5 px-6 py-8 text-center text-muted">
          اتصال به RankVerse Core Engine برقرار نشد.
          <span className="num mt-1 block text-xs text-gold/70">{loadError}</span>
        </div>
      ) : lists.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface/60 px-6 py-10 text-center text-muted">
          هنوز لیستی ساخته نشده. اولین نفر باشید!
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {lists.map((list) => (
            <ListCard key={list.id} list={list} />
          ))}
        </div>
      )}
    </main>
  );
}