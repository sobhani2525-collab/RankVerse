import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ListDetailClient from "@/components/ListDetailClient";
import RelatedLists from "@/components/RelatedLists";
import { getListBySlug, getListComments } from "@/lib/api";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  try {
    const detail = await getListBySlug(slug);
    return {
      title: `${detail.title} | RankVerse`,
      description:
        detail.description ||
        `لیست «${detail.title}» در RankVerse — ${detail.items.length} آیتم، ${detail.like_count} لایک.`,
    };
  } catch {
    return { title: "لیست | RankVerse" };
  }
}

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  try {
    const [detail, comments] = await Promise.all([
      getListBySlug(slug),
      getListComments(slug),
    ]);

    return (
      <>
        <ListDetailClient slug={slug} initialDetail={detail} initialComments={comments} />
        <div className="mx-auto max-w-3xl px-6 pb-14">
          <RelatedLists slug={slug} />
        </div>
      </>
    );
  } catch {
    notFound();
  }
}