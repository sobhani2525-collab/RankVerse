/**
 * List slugs are Persian («بهترین-فیلم-های-نولان»), so route params can
 * arrive percent-encoded or already decoded depending on the caller.
 * Always compare decoded, always build links encoded.
 */
export function decodeListSlug(slug: string): string {
  try {
    return decodeURIComponent(slug).normalize("NFC");
  } catch {
    return slug;
  }
}

export function encodeListSlug(slug: string): string {
  return encodeURIComponent(decodeListSlug(slug));
}

export function listHref(slug: string): string {
  return `/lists/${encodeListSlug(slug)}`;
}
