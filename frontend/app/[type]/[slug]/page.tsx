import { notFound } from "next/navigation";
import { ENTITY_TYPE_REGISTRY } from "@/lib/entity-registry";

export const revalidate = 60;

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
  } catch {
    notFound();
  }

  const { Component } = entry;
  return <Component data={data} />;
}
