import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isNotFoundError } from "@/lib/api";
import { ENTITY_TYPE_REGISTRY } from "@/lib/entity-registry";
import JsonLd from "@/components/JsonLd";
import { genreMetadata, personJsonLd, personMetadata } from "@/lib/seo";
import type { GenreDetail, PersonDetail } from "@/lib/types";

// One API read shared by generateMetadata and the page.
const loadEntity = cache((type: string, slug: string) => ENTITY_TYPE_REGISTRY[type].fetch(slug));

export async function generateMetadata({ params }: { params: Promise<{ type: string; slug: string }> }): Promise<Metadata> {
  const { type, slug } = await params;
  if (!ENTITY_TYPE_REGISTRY[type]) return {};
  const path = `/${type}/${slug}`;
  try {
    const data = await loadEntity(type, slug);
    if (type === "person") return personMetadata(data as PersonDetail, path);
    if (type === "genre") return genreMetadata(data as GenreDetail, path);
    return { alternates: { canonical: path } };
  } catch (err) {
    if (isNotFoundError(err)) return { title: "صفحه پیدا نشد", robots: { index: false, follow: false } };
    return {};
  }
}

export const revalidate = 3600;

// No paths are prerendered at build; each one is rendered on its first
// visit and then served from the ISR cache. Without this export the route
// is fully dynamic and `revalidate` above only affects the fetch cache.
export async function generateStaticParams() {
  return [];
}

export default async function EntityPage({
  params,
}: {
  params: Promise<{ type: string; slug: string }>;
}) {
  const { type, slug } = await params;

  const entry = ENTITY_TYPE_REGISTRY[type];
  if (!entry) notFound();

  let data;
  try {
    data = await loadEntity(type, slug);
  } catch (err) {
    // Only a real 404 is a 404: a timeout or 5xx rethrows, so ISR keeps
    // the last good page instead of caching "not found" for an hour.
    if (isNotFoundError(err)) notFound();
    throw err;
  }

  const { Component } = entry;
  return (
    <>
      {type === "person" && <JsonLd data={personJsonLd(data as PersonDetail, `/${type}/${slug}`)} />}
      <Component data={data} />
    </>
  );
}
