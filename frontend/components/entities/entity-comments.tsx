"use client";

import { useEffect, useState } from "react";
import ListComments from "@/components/ListComments";
import { getEntityComments } from "@/lib/api";
import type { ListComment } from "@/lib/types";

/**
 * Comments load in the browser, not on the server: movie and series pages are
 * statically cached (ISR), and an uncached server read would make every visit
 * a full server render. A new comment is then visible immediately anyway.
 */
export default function EntityComments({ entityId }: { entityId: string }) {
  const [comments, setComments] = useState<ListComment[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getEntityComments(entityId)
      .then((c) => !cancelled && setComments(c))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  if (failed) {
    return <p className="rounded-xl border border-border px-4 py-6 text-center text-sm text-muted">دریافت نظرات ممکن نشد. صفحه را دوباره باز کنید.</p>;
  }
  if (comments === null) return <div className="h-40 animate-pulse rounded-2xl bg-surface2/50" aria-hidden="true" />;
  return <ListComments entityId={entityId} initialComments={comments} tone="text-gold" />;
}
