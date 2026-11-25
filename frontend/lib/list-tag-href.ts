export function listTagSlug(tag: string): string {
  return tag.replace(/[ \t\r\n\u200c-]+/g, "-");
}

export function listTagHref(tag: string, page = 1): string {
  const slug = listTagSlug(tag);
  const segment = slug === "." || slug === ".." || slug.startsWith("~") ? `~${slug}` : slug;
  return `/list-tags/${encodeURIComponent(segment)}${page > 1 ? `?page=${page}` : ""}`;
}

export function listTagPageNumber(value: string | string[] | undefined): number {
  const page = Number(value);
  return typeof value === "string" && /^\d+$/.test(value)
    && Number.isSafeInteger(page) && page > 0 ? page : 1;
}
