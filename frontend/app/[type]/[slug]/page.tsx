import { notFound } from "next/navigation";
import { isNotFoundError } from "@/lib/api";
import { ENTITY_TYPE_REGISTRY } from "@/lib/entity-registry";

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
    data = await entry.fetch(slug);
  } catch (err) {
    // Only a real 404 is a 404: a timeout or 5xx rethrows, so ISR keeps
    // the last good page instead of caching "not found" for an hour.
    if (isNotFoundError(err)) notFound();
    throw err;
  }

  const { Component } = entry;
  return <Component data={data} />;
}
