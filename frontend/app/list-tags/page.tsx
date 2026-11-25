import { permanentRedirect, redirect } from "next/navigation";
import { listTagHref, listTagPageNumber } from "@/lib/list-tag-href";

export default async function LegacyListTagPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string | string[]; page?: string | string[] }>;
}) {
  const { tag, page } = await searchParams;
  if (typeof tag !== "string" || !tag.trim()) redirect("/lists");
  permanentRedirect(listTagHref(tag, listTagPageNumber(page)));
}
