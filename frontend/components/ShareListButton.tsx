"use client";
import { listHref } from "@/lib/list-url";
import ShareMenu from "@/components/share/ShareMenu";
import { absoluteUrl } from "@/lib/site";

/**
 * Same circular icon-button look as DetailShareButton (movie/tv-series
 * detail pages), just building a /lists/{slug} url instead of resolving
 * one through detailPathFor.
 */
export default function ShareListButton({
  slug,
  title,
  size = 44,
  shape = "circle",
}: {
  slug: string;
  title: string;
  size?: number;
  /** "square" = the list hero's rounded-square action buttons. */
  shape?: "circle" | "square";
}) {
  return <ShareMenu url={absoluteUrl(listHref(slug))} title={`${title} | RankVerse`} text={title} size={size} shape={shape} />;
}
