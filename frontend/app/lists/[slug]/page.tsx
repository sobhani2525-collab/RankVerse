import { notFound } from "next/navigation";
import Link from "next/link";
import RelatedLists from "@/components/RelatedLists";
import ListComments from "@/components/ListComments";
import { ListViewerProvider } from "@/components/list-detail/ListViewerContext";
import ListHero from "@/components/list-detail/ListHero";
import ListDNA from "@/components/list-detail/ListDNA";
import ListManageArea from "@/components/list-detail/ListManageArea";
import ListBattlePreview from "@/components/list-detail/ListBattlePreview";
import { getListBySlug, getListComments } from "@/lib/api";
import type { ListComment, ListDetail } from "@/lib/types";

/**
 * List detail ("Constellation" layout): the list as a path through the
 * knowledge graph. Desktop: hero + DNA, then spine + a 380px sidebar
 * (battle, related lists, comments). Mobile: one column in that order.
 */
export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let detail: ListDetail;
  let comments: ListComment[];
  try {
    [detail, comments] = await Promise.all([getListBySlug(slug), getListComments(slug)]);
  } catch {
    notFound();
  }

  return (
    <ListViewerProvider slug={slug} initialDetail={detail}>
      <main className="mx-auto max-w-[1440px] px-4 pb-8 lg:px-20">
        <div className="flex flex-col gap-8 pb-9 pt-8 lg:flex-row lg:items-start lg:gap-14 lg:pb-14 lg:pt-[72px]">
          <ListHero detail={detail} />
          {detail.dna && <ListDNA dna={detail.dna} itemCount={detail.items.length} />}
        </div>

        <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:gap-14">
          <div className="min-w-0 flex-1">
            <ListManageArea />
          </div>

          <aside className="flex shrink-0 flex-col gap-10 lg:w-[380px] lg:gap-7">
            {detail.items.length >= 2 && (
              // Keyed by the items so an added/removed item restarts the run
              // instead of leaving its indices pointing past the list.
              <ListBattlePreview key={detail.items.map((i) => i.id).join(",")} items={detail.items} />
            )}
            <RelatedLists slug={slug} />
            <ListComments slug={slug} initialComments={comments} />
          </aside>
        </div>

        <footer className="mt-14 flex flex-col gap-2 border-t border-border-soft pb-4 pt-6 text-xs leading-[1.8] text-dim lg:mt-20 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:text-[13px]">
          <span>
            {detail.list_type === "community_ordered"
              ? "ترتیب این لیست با رأی کاربران تعیین می‌شود؛"
              : "ترتیب این لیست انتخاب سازنده است؛"}{" "}
            امتیاز ترکیبی از رأی جامعه، روند محبوبیت و نتایج نبردها محاسبه می‌شود.
          </span>
          <Link href="/rankings" className="flex min-h-[44px] shrink-0 items-center text-violet-light hover:text-ink">
            روش امتیازدهی
          </Link>
        </footer>
      </main>
    </ListViewerProvider>
  );
}
