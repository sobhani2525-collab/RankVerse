import Link from "next/link";
import ListTicketCard from "@/components/lists/list-ticket-card";
import ListsFilterBar, { parseSort, parseType } from "@/components/lists/lists-filter-bar";
import MarqueeSign from "@/components/lists/marquee-sign";
import { discoverLists } from "@/lib/api";
import { listSummaryToTicketCard } from "@/lib/entity-card-adapters";
import { rethrowOutsideBuild } from "@/lib/isr";

export default async function ListsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; type?: string }>;
}) {
  const params = await searchParams;
  const sort = parseSort(params.sort);
  const type = parseType(params.type);

  let lists: Awaited<ReturnType<typeof discoverLists>> = [];
  let loadError: string | null = null;

  try {
    lists = await discoverLists({
      page_size: 30,
      sort,
      entity_type: type === "all" ? undefined : type,
    });
  } catch (err) {
    rethrowOutsideBuild(err);
    loadError = err instanceof Error ? err.message : "خطا در دریافت اطلاعات";
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 md:px-6 md:py-14">
      <section className="mb-10 flex flex-col items-center gap-8 rounded-3xl border border-[#1B2138] bg-[rgba(18,23,42,.5)] px-6 py-8 md:flex-row md:justify-between md:gap-10 md:px-12 md:py-10">
        <div className="max-w-xl">
          <span dir="ltr" className="font-mono text-[11px] uppercase tracking-[.3em] text-[#4FB8A6]">
            MAKE YOUR LIST
          </span>
          <h1 className="mt-3 text-[32px] font-black leading-tight text-[#F2F0E8] md:text-[46px]">
            سلیقه‌ات را{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(90deg, #9B7BFF, #4FB8A6)" }}
            >
              روی پرده
            </span>{" "}
            ببر
          </h1>
          <p className="mt-4 text-base leading-[2] text-[#C7CCE0]">
            فیلم‌هایی که دوستشان داری را کنار هم بچین، رتبه بده و با بقیه به اشتراک بگذار. شاید لیست تو، فیلم بعدیِ کسی باشد.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link
              href="/lists/new"
              className="inline-flex h-[52px] items-center rounded-[14px] px-7 font-bold text-[#0B0F1A] transition hover:opacity-90"
              style={{ backgroundImage: "linear-gradient(90deg, #8B6CF0, #4FB8A6)" }}
            >
              ساخت لیست جدید
            </Link>
            <span className="text-[13px] text-[#8A93A6]">فقط چند دقیقه وقت می‌گیرد</span>
          </div>
        </div>
        <MarqueeSign className="h-auto w-full max-w-[440px] shrink-0" />
      </section>

      <ListsFilterBar sort={sort} type={type} />

      {loadError ? (
        <div className="rounded-xl border border-gold/30 bg-gold/5 px-6 py-8 text-center text-muted">
          اتصال به RankVerse Core Engine برقرار نشد.
          <span className="num mt-1 block text-xs text-gold/70">{loadError}</span>
        </div>
      ) : lists.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface/60 px-6 py-10 text-center text-muted">
          {type === "all" ? "هنوز لیستی ساخته نشده. اولین نفر باشید!" : "لیستی با این فیلتر پیدا نشد."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {lists.map((list) => (
            <ListTicketCard key={list.id} list={listSummaryToTicketCard(list)} />
          ))}
        </div>
      )}
    </main>
  );
}
