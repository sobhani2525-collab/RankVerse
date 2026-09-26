"use client";

import { startTransition } from "react";
import { useRouter } from "next/navigation";

// Shown when a page can't be rendered at all -- in practice the backend
// being unreachable for a page with no cached version yet (lib/isr.ts).
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  // The failure happened in a server render, so retrying means re-fetching
  // the page from the server, not just re-rendering on the client.
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });

  return (
    <main className="mx-auto max-w-7xl px-6 py-14">
      <div className="rounded-xl border border-gold/30 bg-gold/5 px-6 py-8 text-center text-muted">
        اتصال به RankVerse Core Engine برقرار نشد.
        <button type="button" onClick={retry} className="mt-4 block w-full text-sm text-teal hover:underline">
          دوباره تلاش کن
        </button>
      </div>
    </main>
  );
}
