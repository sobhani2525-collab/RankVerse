import { notFound } from "next/navigation";
import ListDetailClient from "@/components/ListDetailClient";
import RelatedLists from "@/components/RelatedLists";
import { getListBySlug, getListComments } from "@/lib/api";

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
        <div className="mx-auto max-w-7xl px-6 pb-14">
          <RelatedLists slug={slug} />
        </div>
      </>
    );
  } catch {
    notFound();
  }
}