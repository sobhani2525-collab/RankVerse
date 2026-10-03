"use client";
import { detailPathFor } from "@/lib/entity-routes";
import ShareMenu from "@/components/share/ShareMenu";
import { absoluteUrl } from "@/lib/site";

export interface DetailShareEntity {
  slug: string;
  entity_type: string;
}

/**
 * The share toggle for a movie/tv-series detail page header -- same circular
 * shape/size as DetailFavoriteButton so the two sit as a matched pair.
 */
export default function DetailShareButton({
  entity,
  title,
  size = 44,
  shape = "circle",
}: {
  entity: DetailShareEntity;
  title: string;
  size?: number;
  /** "square" = the Constellation-style hero's rounded-square action buttons. */
  shape?: "circle" | "square";
}) {
  const path = detailPathFor(entity.entity_type, entity.slug) ?? `/${entity.entity_type}/${entity.slug}`;
  return <ShareMenu url={absoluteUrl(path)} title={`${title} | RankVerse`} text={title} size={size} shape={shape} />;
}
