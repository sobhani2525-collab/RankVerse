import type { Metadata } from "next";
import DraftListEditor from "@/components/DraftListEditor";
import { decodeListSlug } from "@/lib/list-url";

export const metadata: Metadata = {
  title: "افزودن آیتم به فهرست",
  robots: { index: false, follow: false },
};

export default async function DraftListPage({ params }: { params: Promise<{ slug: string }> }) {
  return <DraftListEditor slug={decodeListSlug((await params).slug)} />;
}
